-- KPI Database Schema
-- Production-ready with proper indexing and constraints

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Create enum types
CREATE TYPE channel_type AS ENUM (
  'organic_search',
  'paid_search',
  'social_media',
  'email',
  'direct',
  'referral',
  'display',
  'affiliate',
  'content',
  'other'
);

CREATE TYPE lead_status AS ENUM (
  'new',
  'contacted',
  'qualified',
  'converted',
  'lost'
);

CREATE TYPE attribution_model AS ENUM (
  'first_touch',
  'last_touch',
  'linear',
  'time_decay',
  'u_shaped',
  'w_shaped',
  'data_driven'
);

-- Leads table
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_id VARCHAR(255) UNIQUE,
  email VARCHAR(255) NOT NULL,
  source_channel channel_type NOT NULL,
  campaign_id VARCHAR(255),
  status lead_status DEFAULT 'new',
  quality_score DECIMAL(3,2) CHECK (quality_score >= 0 AND quality_score <= 1),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_leads_created_at ON leads(created_at);
CREATE INDEX idx_leads_source_channel ON leads(source_channel);
CREATE INDEX idx_leads_campaign_id ON leads(campaign_id);
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_quality_score ON leads(quality_score);
CREATE INDEX idx_leads_metadata ON leads USING GIN(metadata);

-- Customers table
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID REFERENCES leads(id),
  external_id VARCHAR(255) UNIQUE,
  email VARCHAR(255) NOT NULL,
  acquisition_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  acquisition_channel channel_type NOT NULL,
  acquisition_cost DECIMAL(10,2),
  lifetime_value DECIMAL(10,2),
  churn_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_customers_acquisition_date ON customers(acquisition_date);
CREATE INDEX idx_customers_acquisition_channel ON customers(acquisition_channel);
CREATE INDEX idx_customers_lifetime_value ON customers(lifetime_value);
CREATE INDEX idx_customers_churn_date ON customers(churn_date);
CREATE INDEX idx_customers_lead_id ON customers(lead_id);

-- Marketing costs table
CREATE TABLE IF NOT EXISTS marketing_costs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel channel_type NOT NULL,
  campaign_id VARCHAR(255),
  cost_date DATE NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  impressions INTEGER,
  clicks INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_marketing_costs_channel ON marketing_costs(channel);
CREATE INDEX idx_marketing_costs_campaign_id ON marketing_costs(campaign_id);
CREATE INDEX idx_marketing_costs_cost_date ON marketing_costs(cost_date);
CREATE INDEX idx_marketing_costs_channel_date ON marketing_costs(channel, cost_date);

-- Content table
CREATE TABLE IF NOT EXISTS content (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_id VARCHAR(255) UNIQUE,
  title VARCHAR(500) NOT NULL,
  type VARCHAR(50) NOT NULL,
  channel channel_type NOT NULL,
  production_cost DECIMAL(10,2),
  distribution_cost DECIMAL(10,2),
  published_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_content_type ON content(type);
CREATE INDEX idx_content_channel ON content(channel);
CREATE INDEX idx_content_published_date ON content(published_date);

-- Content metrics table
CREATE TABLE IF NOT EXISTS content_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  content_id UUID REFERENCES content(id) ON DELETE CASCADE,
  metric_date DATE NOT NULL,
  views INTEGER DEFAULT 0,
  unique_views INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  revenue_attributed DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(content_id, metric_date)
);

CREATE INDEX idx_content_metrics_content_id ON content_metrics(content_id);
CREATE INDEX idx_content_metrics_date ON content_metrics(metric_date);
CREATE INDEX idx_content_metrics_content_date ON content_metrics(content_id, metric_date);

-- Channel touchpoints table
CREATE TABLE IF NOT EXISTS channel_touchpoints (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID REFERENCES leads(id),
  customer_id UUID REFERENCES customers(id),
  channel channel_type NOT NULL,
  touchpoint_date TIMESTAMP WITH TIME ZONE NOT NULL,
  position_in_journey INTEGER NOT NULL,
  interaction_type VARCHAR(50),
  attribution_weight DECIMAL(3,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_touchpoints_lead_id ON channel_touchpoints(lead_id);
CREATE INDEX idx_touchpoints_customer_id ON channel_touchpoints(customer_id);
CREATE INDEX idx_touchpoints_channel ON channel_touchpoints(channel);
CREATE INDEX idx_touchpoints_date ON channel_touchpoints(touchpoint_date);
CREATE INDEX idx_touchpoints_position ON channel_touchpoints(position_in_journey);

-- Revenue table
CREATE TABLE IF NOT EXISTS revenue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES customers(id),
  amount DECIMAL(10,2) NOT NULL,
  revenue_date TIMESTAMP WITH TIME ZONE NOT NULL,
  type VARCHAR(50) NOT NULL,
  recurring BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_revenue_customer_id ON revenue(customer_id);
CREATE INDEX idx_revenue_date ON revenue(revenue_date);
CREATE INDEX idx_revenue_type ON revenue(type);
CREATE INDEX idx_revenue_recurring ON revenue(recurring);

-- Email campaigns table
CREATE TABLE IF NOT EXISTS email_campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  sent_date TIMESTAMP WITH TIME ZONE,
  total_sent INTEGER DEFAULT 0,
  total_delivered INTEGER DEFAULT 0,
  total_opened INTEGER DEFAULT 0,
  unique_opens INTEGER DEFAULT 0,
  total_clicked INTEGER DEFAULT 0,
  unique_clicks INTEGER DEFAULT 0,
  total_unsubscribed INTEGER DEFAULT 0,
  total_bounced INTEGER DEFAULT 0,
  total_conversions INTEGER DEFAULT 0,
  revenue_generated DECIMAL(10,2) DEFAULT 0,
  cost DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_email_campaigns_sent_date ON email_campaigns(sent_date);
CREATE INDEX idx_email_campaigns_campaign_id ON email_campaigns(campaign_id);

-- Social media metrics table
CREATE TABLE IF NOT EXISTS social_media_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  platform VARCHAR(50) NOT NULL,
  metric_date DATE NOT NULL,
  followers INTEGER DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  engagements INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  mentions INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  spend DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(platform, metric_date)
);

CREATE INDEX idx_social_metrics_platform ON social_media_metrics(platform);
CREATE INDEX idx_social_metrics_date ON social_media_metrics(metric_date);

-- SEO metrics table
CREATE TABLE IF NOT EXISTS seo_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  metric_date DATE NOT NULL,
  organic_traffic INTEGER DEFAULT 0,
  keyword_rankings JSONB DEFAULT '[]'::jsonb,
  backlinks INTEGER DEFAULT 0,
  domain_authority INTEGER,
  page_authority INTEGER,
  bounce_rate DECIMAL(5,2),
  avg_session_duration INTEGER,
  pages_per_session DECIMAL(5,2),
  conversions INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(metric_date)
);

CREATE INDEX idx_seo_metrics_date ON seo_metrics(metric_date);
CREATE INDEX idx_seo_metrics_rankings ON seo_metrics USING GIN(keyword_rankings);

-- KPI calculations table
CREATE TABLE IF NOT EXISTS kpi_calculations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kpi_type VARCHAR(50) NOT NULL,
  calculation_date TIMESTAMP WITH TIME ZONE NOT NULL,
  time_period VARCHAR(20) NOT NULL,
  channel channel_type,
  value DECIMAL(15,4) NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_kpi_calculations_type ON kpi_calculations(kpi_type);
CREATE INDEX idx_kpi_calculations_date ON kpi_calculations(calculation_date);
CREATE INDEX idx_kpi_calculations_type_date ON kpi_calculations(kpi_type, calculation_date);
CREATE INDEX idx_kpi_calculations_channel ON kpi_calculations(channel);

-- Create update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply update trigger to relevant tables
CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON leads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_content_updated_at BEFORE UPDATE ON content
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_campaigns_updated_at BEFORE UPDATE ON email_campaigns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();