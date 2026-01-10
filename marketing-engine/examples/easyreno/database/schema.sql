-- EasyReno Marketing Database Schema
-- B2B Lead Generation and Local Marketing Platform

CREATE DATABASE IF NOT EXISTS easyreno_marketing;
\c easyreno_marketing;

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis"; -- For geo-spatial queries
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- Custom types
CREATE TYPE lead_status AS ENUM ('new', 'contacted', 'qualified', 'quoted', 'won', 'lost', 'nurturing');
CREATE TYPE lead_source AS ENUM ('website', 'google_my_business', 'facebook', 'yelp', 'angi', 'thumbtack', 'referral', 'direct_call', 'trade_show');
CREATE TYPE project_type AS ENUM ('kitchen_remodel', 'bathroom_remodel', 'home_addition', 'whole_house', 'exterior', 'flooring', 'painting', 'other');
CREATE TYPE review_platform AS ENUM ('google', 'yelp', 'facebook', 'bbb', 'angi', 'houzz', 'thumbtack');
CREATE TYPE contractor_status AS ENUM ('active', 'inactive', 'suspended', 'pending_verification');
CREATE TYPE communication_channel AS ENUM ('email', 'sms', 'phone', 'whatsapp');

-- Contractors/Partners table
CREATE TABLE contractors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_name VARCHAR(255) NOT NULL,
    owner_name VARCHAR(255),
    email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(50) NOT NULL,
    license_number VARCHAR(100),
    license_verified BOOLEAN DEFAULT false,
    license_expiry DATE,
    insurance_verified BOOLEAN DEFAULT false,
    insurance_expiry DATE,
    status contractor_status DEFAULT 'pending_verification',
    service_areas JSONB DEFAULT '[]'::jsonb, -- Array of zip codes/polygons
    specialties project_type[] NOT NULL,
    years_in_business INTEGER,
    team_size INTEGER,
    
    -- Location data
    address_street VARCHAR(255),
    address_city VARCHAR(100),
    address_state VARCHAR(2),
    address_zip VARCHAR(10),
    location GEOMETRY(Point, 4326), -- PostGIS point
    service_radius_miles INTEGER DEFAULT 25,
    
    -- Business hours
    business_hours JSONB DEFAULT '{}'::jsonb,
    
    -- Capabilities
    min_project_size DECIMAL(10, 2),
    max_project_size DECIMAL(10, 2),
    average_project_duration_days INTEGER,
    
    -- Performance metrics
    total_leads_received INTEGER DEFAULT 0,
    total_quotes_sent INTEGER DEFAULT 0,
    total_jobs_won INTEGER DEFAULT 0,
    total_revenue DECIMAL(12, 2) DEFAULT 0,
    average_rating DECIMAL(3, 2) DEFAULT 0,
    total_reviews INTEGER DEFAULT 0,
    
    -- Integration tokens
    google_my_business_id VARCHAR(255),
    yelp_business_id VARCHAR(255),
    facebook_page_id VARCHAR(255),
    
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Leads table
CREATE TABLE leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contractor_id UUID REFERENCES contractors(id) ON DELETE CASCADE,
    
    -- Contact information
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    preferred_contact_method communication_channel DEFAULT 'phone',
    
    -- Lead details
    source lead_source NOT NULL,
    source_details JSONB DEFAULT '{}'::jsonb,
    status lead_status DEFAULT 'new',
    score INTEGER DEFAULT 0 CHECK (score >= 0 AND score <= 100),
    
    -- Project information
    project_type project_type NOT NULL,
    project_description TEXT,
    budget_range VARCHAR(50),
    budget_min DECIMAL(10, 2),
    budget_max DECIMAL(10, 2),
    timeline VARCHAR(100),
    start_date_preference DATE,
    
    -- Location
    address_street VARCHAR(255),
    address_city VARCHAR(100),
    address_state VARCHAR(2),
    address_zip VARCHAR(10),
    location GEOMETRY(Point, 4326),
    
    -- Tracking
    utm_source VARCHAR(255),
    utm_medium VARCHAR(255),
    utm_campaign VARCHAR(255),
    referring_url TEXT,
    landing_page TEXT,
    ip_address INET,
    
    -- Assignment and timing
    assigned_at TIMESTAMP,
    first_contact_at TIMESTAMP,
    qualified_at TIMESTAMP,
    quoted_at TIMESTAMP,
    won_at TIMESTAMP,
    lost_at TIMESTAMP,
    lost_reason VARCHAR(255),
    
    -- Engagement metrics
    emails_sent INTEGER DEFAULT 0,
    emails_opened INTEGER DEFAULT 0,
    sms_sent INTEGER DEFAULT 0,
    calls_made INTEGER DEFAULT 0,
    
    tags JSONB DEFAULT '[]'::jsonb,
    custom_fields JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Lead scoring rules
CREATE TABLE lead_scoring_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    conditions JSONB NOT NULL, -- Rule conditions
    score_adjustment INTEGER NOT NULL,
    max_score_contribution INTEGER,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Quotes table
CREATE TABLE quotes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    contractor_id UUID NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
    quote_number VARCHAR(50) NOT NULL UNIQUE,
    
    -- Quote details
    total_amount DECIMAL(10, 2) NOT NULL,
    labor_amount DECIMAL(10, 2),
    materials_amount DECIMAL(10, 2),
    tax_amount DECIMAL(10, 2),
    
    -- Line items stored as JSONB for flexibility
    line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
    
    -- Terms
    valid_until DATE NOT NULL,
    payment_terms TEXT,
    deposit_required DECIMAL(10, 2),
    deposit_percentage DECIMAL(5, 2),
    
    -- Timeline
    estimated_start_date DATE,
    estimated_completion_date DATE,
    estimated_duration_days INTEGER,
    
    -- Status tracking
    status VARCHAR(50) DEFAULT 'draft',
    sent_at TIMESTAMP,
    viewed_at TIMESTAMP,
    accepted_at TIMESTAMP,
    rejected_at TIMESTAMP,
    rejection_reason TEXT,
    
    -- Documents
    pdf_url VARCHAR(500),
    
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Reviews table
CREATE TABLE reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contractor_id UUID NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    platform review_platform NOT NULL,
    platform_review_id VARCHAR(255),
    
    -- Review content
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    title VARCHAR(500),
    content TEXT,
    reviewer_name VARCHAR(255),
    reviewer_email VARCHAR(255),
    
    -- Response
    response_content TEXT,
    responded_at TIMESTAMP,
    response_by UUID,
    
    -- Metadata
    is_verified BOOLEAN DEFAULT false,
    photos JSONB DEFAULT '[]'::jsonb,
    helpful_count INTEGER DEFAULT 0,
    
    -- Sentiment analysis
    sentiment_score DECIMAL(3, 2), -- -1 to 1
    keywords JSONB DEFAULT '[]'::jsonb,
    
    published_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Review campaigns
CREATE TABLE review_campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contractor_id UUID NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    trigger_event VARCHAR(100) NOT NULL, -- 'project_completed', 'manual', etc
    
    -- Campaign settings
    is_active BOOLEAN DEFAULT true,
    platforms review_platform[] NOT NULL,
    
    -- Timing
    initial_delay_hours INTEGER DEFAULT 24,
    followup_delays_hours INTEGER[] DEFAULT ARRAY[72, 168], -- 3 days, 7 days
    
    -- Incentives
    offer_incentive BOOLEAN DEFAULT false,
    incentive_type VARCHAR(50),
    incentive_value DECIMAL(10, 2),
    
    -- Templates
    sms_templates JSONB DEFAULT '[]'::jsonb,
    email_templates JSONB DEFAULT '[]'::jsonb,
    
    -- Performance
    total_sent INTEGER DEFAULT 0,
    total_reviews_generated INTEGER DEFAULT 0,
    average_rating_generated DECIMAL(3, 2),
    
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Review campaign executions
CREATE TABLE review_campaign_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID NOT NULL REFERENCES review_campaigns(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    
    -- Execution tracking
    phase INTEGER DEFAULT 0, -- 0: initial, 1: first followup, etc
    sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    channel communication_channel NOT NULL,
    
    -- Response tracking
    opened_at TIMESTAMP,
    clicked_at TIMESTAMP,
    review_submitted_at TIMESTAMP,
    review_id UUID REFERENCES reviews(id),
    
    -- Incentive tracking
    incentive_offered BOOLEAN DEFAULT false,
    incentive_claimed BOOLEAN DEFAULT false,
    incentive_claimed_at TIMESTAMP
);

-- Local SEO campaigns
CREATE TABLE local_seo_campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contractor_id UUID NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'active',
    
    -- Targeting
    target_location GEOMETRY(Polygon, 4326),
    target_keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
    target_neighborhoods JSONB DEFAULT '[]'::jsonb,
    
    -- Budget
    monthly_budget DECIMAL(10, 2),
    spend_to_date DECIMAL(10, 2) DEFAULT 0,
    
    -- Content strategy
    content_calendar JSONB DEFAULT '{}'::jsonb,
    gmb_posting_frequency VARCHAR(50), -- 'daily', 'weekly', etc
    blog_posting_frequency VARCHAR(50),
    
    -- Performance metrics
    rankings JSONB DEFAULT '{}'::jsonb, -- Keyword -> position mapping
    local_pack_appearances INTEGER DEFAULT 0,
    website_traffic_increase DECIMAL(5, 2),
    lead_increase DECIMAL(5, 2),
    
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Communication templates
CREATE TABLE communication_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contractor_id UUID REFERENCES contractors(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'lead_response', 'quote_followup', etc
    channel communication_channel NOT NULL,
    
    -- Content
    subject VARCHAR(500), -- For emails
    content TEXT NOT NULL,
    
    -- Personalization variables
    variables JSONB DEFAULT '[]'::jsonb,
    
    -- Usage tracking
    times_used INTEGER DEFAULT 0,
    last_used_at TIMESTAMP,
    
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Lead communications log
CREATE TABLE lead_communications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    contractor_id UUID NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
    
    -- Communication details
    type VARCHAR(50) NOT NULL, -- 'email', 'sms', 'call', etc
    direction VARCHAR(10) NOT NULL, -- 'inbound' or 'outbound'
    subject VARCHAR(500),
    content TEXT,
    
    -- Metadata
    from_address VARCHAR(255),
    to_address VARCHAR(255),
    
    -- Status
    status VARCHAR(50) DEFAULT 'sent',
    sent_at TIMESTAMP,
    delivered_at TIMESTAMP,
    opened_at TIMESTAMP,
    clicked_at TIMESTAMP,
    replied_at TIMESTAMP,
    
    -- Call specific
    call_duration_seconds INTEGER,
    call_recording_url VARCHAR(500),
    
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- GMB posts
CREATE TABLE gmb_posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contractor_id UUID NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
    post_id VARCHAR(255), -- GMB's post ID
    
    -- Content
    type VARCHAR(50) NOT NULL, -- 'STANDARD', 'EVENT', 'OFFER', 'PRODUCT'
    title VARCHAR(500),
    content TEXT NOT NULL,
    cta_type VARCHAR(50), -- 'BOOK', 'CALL', 'LEARN_MORE', etc
    cta_url VARCHAR(500),
    
    -- Media
    photo_urls JSONB DEFAULT '[]'::jsonb,
    
    -- Scheduling
    scheduled_for TIMESTAMP,
    published_at TIMESTAMP,
    expires_at TIMESTAMP,
    
    -- Performance
    views INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    calls INTEGER DEFAULT 0,
    
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Competitor tracking
CREATE TABLE competitors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contractor_id UUID NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
    business_name VARCHAR(255) NOT NULL,
    
    -- Identifiers
    google_place_id VARCHAR(255),
    yelp_business_id VARCHAR(255),
    website_url VARCHAR(500),
    
    -- Metrics to track
    track_reviews BOOLEAN DEFAULT true,
    track_rankings BOOLEAN DEFAULT true,
    track_pricing BOOLEAN DEFAULT false,
    
    -- Latest snapshot
    latest_rating DECIMAL(3, 2),
    latest_review_count INTEGER,
    latest_response_time_hours INTEGER,
    
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Analytics events
CREATE TABLE analytics_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contractor_id UUID NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    
    -- Event details
    event_type VARCHAR(100) NOT NULL,
    event_category VARCHAR(100),
    event_properties JSONB DEFAULT '{}'::jsonb,
    
    -- Attribution
    source VARCHAR(255),
    medium VARCHAR(255),
    campaign VARCHAR(255),
    
    -- Context
    ip_address INET,
    user_agent TEXT,
    referrer TEXT,
    
    occurred_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_contractors_location ON contractors USING gist(location);
CREATE INDEX idx_contractors_status ON contractors(status) WHERE status = 'active';
CREATE INDEX idx_contractors_specialties ON contractors USING gin(specialties);

CREATE INDEX idx_leads_contractor ON leads(contractor_id);
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_created ON leads(created_at DESC);
CREATE INDEX idx_leads_location ON leads USING gist(location);
CREATE INDEX idx_leads_project_type ON leads(project_type);
CREATE INDEX idx_leads_score ON leads(score DESC);

CREATE INDEX idx_quotes_lead ON quotes(lead_id);
CREATE INDEX idx_quotes_contractor ON quotes(contractor_id);
CREATE INDEX idx_quotes_status ON quotes(status);

CREATE INDEX idx_reviews_contractor ON reviews(contractor_id);
CREATE INDEX idx_reviews_platform ON reviews(platform);
CREATE INDEX idx_reviews_rating ON reviews(rating);
CREATE INDEX idx_reviews_published ON reviews(published_at DESC);

CREATE INDEX idx_communications_lead ON lead_communications(lead_id);
CREATE INDEX idx_communications_created ON lead_communications(created_at DESC);

CREATE INDEX idx_gmb_posts_contractor ON gmb_posts(contractor_id);
CREATE INDEX idx_gmb_posts_scheduled ON gmb_posts(scheduled_for) WHERE published_at IS NULL;

CREATE INDEX idx_analytics_contractor ON analytics_events(contractor_id);
CREATE INDEX idx_analytics_occurred ON analytics_events(occurred_at DESC);
CREATE INDEX idx_analytics_type ON analytics_events(event_type);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_contractors_updated_at BEFORE UPDATE ON contractors FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_quotes_updated_at BEFORE UPDATE ON quotes FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_reviews_updated_at BEFORE UPDATE ON reviews FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON review_campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_seo_campaigns_updated_at BEFORE UPDATE ON local_seo_campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_templates_updated_at BEFORE UPDATE ON communication_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_scoring_rules_updated_at BEFORE UPDATE ON lead_scoring_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_competitors_updated_at BEFORE UPDATE ON competitors FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_gmb_posts_updated_at BEFORE UPDATE ON gmb_posts FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Lead scoring trigger
CREATE OR REPLACE FUNCTION calculate_lead_score()
RETURNS TRIGGER AS $$
DECLARE
    score INTEGER := 0;
    rule RECORD;
BEGIN
    -- Base scoring logic
    -- Budget score
    IF NEW.budget_min >= 50000 THEN
        score := score + 25;
    ELSIF NEW.budget_min >= 25000 THEN
        score := score + 15;
    ELSIF NEW.budget_min >= 10000 THEN
        score := score + 10;
    END IF;
    
    -- Timeline score
    IF NEW.timeline = 'immediate' OR NEW.timeline = 'next_30_days' THEN
        score := score + 20;
    ELSIF NEW.timeline = 'next_60_days' THEN
        score := score + 10;
    END IF;
    
    -- Source score
    IF NEW.source IN ('referral', 'google_my_business') THEN
        score := score + 15;
    ELSIF NEW.source IN ('website', 'angi') THEN
        score := score + 10;
    END IF;
    
    -- Contact info completeness
    IF NEW.email IS NOT NULL AND NEW.phone IS NOT NULL THEN
        score := score + 10;
    END IF;
    
    -- Apply custom scoring rules
    FOR rule IN SELECT * FROM lead_scoring_rules WHERE is_active = true LOOP
        -- This would need custom logic to evaluate JSONB conditions
        -- For now, adding placeholder
        score := score + rule.score_adjustment;
    END LOOP;
    
    -- Cap score at 100
    NEW.score := LEAST(score, 100);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_lead_score_trigger 
BEFORE INSERT OR UPDATE ON leads 
FOR EACH ROW EXECUTE FUNCTION calculate_lead_score();

-- Initial data
INSERT INTO lead_scoring_rules (name, description, conditions, score_adjustment) VALUES
('High Budget', 'Leads with budget over $50k', '{"budget_min": {"$gte": 50000}}'::jsonb, 25),
('Urgent Timeline', 'Projects starting within 30 days', '{"timeline": ["immediate", "next_30_days"]}'::jsonb, 20),
('Referral Source', 'Leads from referrals', '{"source": "referral"}'::jsonb, 15),
('Complete Contact', 'Has both email and phone', '{"email": {"$exists": true}, "phone": {"$exists": true}}'::jsonb, 10);

-- Row Level Security
ALTER TABLE contractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- Create roles
CREATE ROLE easyreno_admin;
CREATE ROLE easyreno_contractor;
CREATE ROLE easyreno_readonly;

-- Grant permissions
GRANT ALL ON ALL TABLES IN SCHEMA public TO easyreno_admin;
GRANT SELECT, INSERT, UPDATE ON leads, quotes, reviews, lead_communications TO easyreno_contractor;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO easyreno_readonly;