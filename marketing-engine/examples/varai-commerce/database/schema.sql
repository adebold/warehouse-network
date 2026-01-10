-- VarAI Commerce Marketing Engine Database Schema
-- Production-ready PostgreSQL schema with proper indexes and constraints

-- Create database
CREATE DATABASE IF NOT EXISTS varai_marketing;
\c varai_marketing;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Custom types
CREATE TYPE campaign_status AS ENUM ('draft', 'scheduled', 'active', 'paused', 'completed', 'archived');
CREATE TYPE channel_type AS ENUM ('email', 'sms', 'push', 'facebook', 'google', 'instagram', 'tiktok');
CREATE TYPE customer_segment AS ENUM ('new', 'active', 'vip', 'at_risk', 'churned', 'win_back');
CREATE TYPE attribution_model AS ENUM ('last_click', 'first_click', 'linear', 'time_decay', 'data_driven');

-- Customers table
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    external_id VARCHAR(255) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    segment customer_segment DEFAULT 'new',
    lifetime_value DECIMAL(10, 2) DEFAULT 0,
    total_orders INTEGER DEFAULT 0,
    first_purchase_date TIMESTAMP,
    last_purchase_date TIMESTAMP,
    predicted_churn_date DATE,
    consent_email BOOLEAN DEFAULT false,
    consent_sms BOOLEAN DEFAULT false,
    consent_push BOOLEAN DEFAULT false,
    tags JSONB DEFAULT '[]'::jsonb,
    attributes JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Products table
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sku VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL,
    compare_price DECIMAL(10, 2),
    cost DECIMAL(10, 2),
    inventory_quantity INTEGER DEFAULT 0,
    inventory_tracked BOOLEAN DEFAULT true,
    category VARCHAR(255),
    tags JSONB DEFAULT '[]'::jsonb,
    image_url VARCHAR(500),
    launch_date DATE,
    discontinue_date DATE,
    is_active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT positive_price CHECK (price >= 0),
    CONSTRAINT positive_inventory CHECK (inventory_quantity >= 0)
);

-- Campaigns table
CREATE TABLE campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(100) NOT NULL,
    status campaign_status NOT NULL DEFAULT 'draft',
    channels channel_type[] NOT NULL,
    start_date TIMESTAMP NOT NULL,
    end_date TIMESTAMP,
    budget DECIMAL(10, 2),
    spent DECIMAL(10, 2) DEFAULT 0,
    target_audience JSONB NOT NULL DEFAULT '{}'::jsonb,
    content JSONB NOT NULL DEFAULT '{}'::jsonb,
    rules JSONB DEFAULT '{}'::jsonb,
    performance_metrics JSONB DEFAULT '{}'::jsonb,
    ab_test_config JSONB,
    created_by UUID NOT NULL,
    approved_by UUID,
    approved_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_date_range CHECK (end_date IS NULL OR end_date > start_date),
    CONSTRAINT positive_budget CHECK (budget IS NULL OR budget >= 0),
    CONSTRAINT spent_within_budget CHECK (spent <= COALESCE(budget, spent))
);

-- Campaign executions
CREATE TABLE campaign_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    channel channel_type NOT NULL,
    variant VARCHAR(50),
    sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    delivered_at TIMESTAMP,
    opened_at TIMESTAMP,
    clicked_at TIMESTAMP,
    converted_at TIMESTAMP,
    unsubscribed_at TIMESTAMP,
    bounced_at TIMESTAMP,
    revenue_generated DECIMAL(10, 2) DEFAULT 0,
    cost DECIMAL(10, 2) DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb,
    CONSTRAINT unique_execution UNIQUE (campaign_id, customer_id, channel, sent_at)
);

-- Orders table for attribution
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    external_id VARCHAR(255) NOT NULL UNIQUE,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    order_number VARCHAR(100) NOT NULL,
    total_amount DECIMAL(10, 2) NOT NULL,
    subtotal_amount DECIMAL(10, 2) NOT NULL,
    discount_amount DECIMAL(10, 2) DEFAULT 0,
    tax_amount DECIMAL(10, 2) DEFAULT 0,
    shipping_amount DECIMAL(10, 2) DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'USD',
    status VARCHAR(50) NOT NULL,
    source VARCHAR(100),
    utm_source VARCHAR(255),
    utm_medium VARCHAR(255),
    utm_campaign VARCHAR(255),
    attribution_data JSONB DEFAULT '{}'::jsonb,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT positive_amounts CHECK (
        total_amount >= 0 AND 
        subtotal_amount >= 0 AND 
        discount_amount >= 0 AND 
        tax_amount >= 0 AND 
        shipping_amount >= 0
    )
);

-- Customer events for behavioral tracking
CREATE TABLE customer_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB DEFAULT '{}'::jsonb,
    session_id UUID,
    ip_address INET,
    user_agent TEXT,
    referrer TEXT,
    utm_source VARCHAR(255),
    utm_medium VARCHAR(255),
    utm_campaign VARCHAR(255),
    occurred_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Attribution touchpoints
CREATE TABLE attribution_touchpoints (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    touchpoint_type VARCHAR(100) NOT NULL,
    channel channel_type NOT NULL,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    timestamp TIMESTAMP NOT NULL,
    interaction_type VARCHAR(50),
    attribution_credit DECIMAL(5, 4) DEFAULT 0,
    position_in_path INTEGER NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    CONSTRAINT valid_credit CHECK (attribution_credit >= 0 AND attribution_credit <= 1)
);

-- Segments definition
CREATE TABLE segments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    type VARCHAR(50) NOT NULL,
    criteria JSONB NOT NULL,
    is_dynamic BOOLEAN DEFAULT true,
    member_count INTEGER DEFAULT 0,
    last_calculated TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Segment members
CREATE TABLE segment_members (
    segment_id UUID NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    added_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    removed_at TIMESTAMP,
    score DECIMAL(5, 4),
    PRIMARY KEY (segment_id, customer_id)
);

-- Email templates
CREATE TABLE email_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    subject VARCHAR(500) NOT NULL,
    preheader VARCHAR(255),
    from_name VARCHAR(255) NOT NULL,
    from_email VARCHAR(255) NOT NULL,
    html_content TEXT NOT NULL,
    text_content TEXT,
    variables JSONB DEFAULT '[]'::jsonb,
    category VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Automation workflows
CREATE TABLE automation_workflows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    trigger_type VARCHAR(100) NOT NULL,
    trigger_config JSONB NOT NULL,
    is_active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Workflow steps
CREATE TABLE workflow_steps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id UUID NOT NULL REFERENCES automation_workflows(id) ON DELETE CASCADE,
    step_order INTEGER NOT NULL,
    action_type VARCHAR(100) NOT NULL,
    action_config JSONB NOT NULL,
    wait_duration INTERVAL,
    condition JSONB,
    PRIMARY KEY (workflow_id, step_order)
);

-- Workflow instances
CREATE TABLE workflow_instances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id UUID NOT NULL REFERENCES automation_workflows(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    current_step INTEGER DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    metadata JSONB DEFAULT '{}'::jsonb,
    CONSTRAINT unique_active_instance UNIQUE (workflow_id, customer_id, started_at)
);

-- Inventory tracking for marketing
CREATE TABLE inventory_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    alert_type VARCHAR(50) NOT NULL,
    threshold INTEGER NOT NULL,
    current_quantity INTEGER NOT NULL,
    campaigns_affected UUID[],
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP
);

-- Performance metrics aggregation
CREATE TABLE performance_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    metric_date DATE NOT NULL,
    metric_type VARCHAR(100) NOT NULL,
    dimension_type VARCHAR(100),
    dimension_value VARCHAR(255),
    impressions BIGINT DEFAULT 0,
    clicks BIGINT DEFAULT 0,
    conversions BIGINT DEFAULT 0,
    revenue DECIMAL(12, 2) DEFAULT 0,
    cost DECIMAL(12, 2) DEFAULT 0,
    unique_visitors BIGINT DEFAULT 0,
    new_customers BIGINT DEFAULT 0,
    returning_customers BIGINT DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb,
    CONSTRAINT unique_metric UNIQUE (metric_date, metric_type, dimension_type, dimension_value)
);

-- Indexes for performance
CREATE INDEX idx_customers_email ON customers USING btree (email);
CREATE INDEX idx_customers_segment ON customers USING btree (segment);
CREATE INDEX idx_customers_tags ON customers USING gin (tags);
CREATE INDEX idx_customers_attributes ON customers USING gin (attributes);
CREATE INDEX idx_customers_updated ON customers USING btree (updated_at DESC);

CREATE INDEX idx_products_sku ON products USING btree (sku);
CREATE INDEX idx_products_active ON products USING btree (is_active) WHERE is_active = true;
CREATE INDEX idx_products_category ON products USING btree (category);
CREATE INDEX idx_products_tags ON products USING gin (tags);
CREATE INDEX idx_products_inventory ON products USING btree (inventory_quantity) WHERE inventory_tracked = true;

CREATE INDEX idx_campaigns_status ON campaigns USING btree (status);
CREATE INDEX idx_campaigns_dates ON campaigns USING btree (start_date, end_date);
CREATE INDEX idx_campaigns_channels ON campaigns USING gin (channels);

CREATE INDEX idx_executions_campaign ON campaign_executions USING btree (campaign_id);
CREATE INDEX idx_executions_customer ON campaign_executions USING btree (customer_id);
CREATE INDEX idx_executions_sent ON campaign_executions USING btree (sent_at DESC);
CREATE INDEX idx_executions_performance ON campaign_executions USING btree (campaign_id, converted_at) WHERE converted_at IS NOT NULL;

CREATE INDEX idx_orders_customer ON orders USING btree (customer_id);
CREATE INDEX idx_orders_created ON orders USING btree (created_at DESC);
CREATE INDEX idx_orders_attribution ON orders USING gin (attribution_data);

CREATE INDEX idx_events_customer ON customer_events USING btree (customer_id, occurred_at DESC);
CREATE INDEX idx_events_type ON customer_events USING btree (event_type);
CREATE INDEX idx_events_session ON customer_events USING btree (session_id);

CREATE INDEX idx_touchpoints_order ON attribution_touchpoints USING btree (order_id);
CREATE INDEX idx_touchpoints_customer ON attribution_touchpoints USING btree (customer_id);
CREATE INDEX idx_touchpoints_campaign ON attribution_touchpoints USING btree (campaign_id);

CREATE INDEX idx_segment_members_active ON segment_members USING btree (segment_id, customer_id) WHERE removed_at IS NULL;

CREATE INDEX idx_workflow_instances_active ON workflow_instances USING btree (workflow_id, status) WHERE status = 'active';
CREATE INDEX idx_workflow_instances_customer ON workflow_instances USING btree (customer_id);

CREATE INDEX idx_metrics_lookup ON performance_metrics USING btree (metric_date DESC, metric_type, dimension_type, dimension_value);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_segments_updated_at BEFORE UPDATE ON segments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_templates_updated_at BEFORE UPDATE ON email_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_workflows_updated_at BEFORE UPDATE ON automation_workflows FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Partitioning for high-volume tables
CREATE TABLE customer_events_y2024m01 PARTITION OF customer_events FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
CREATE TABLE customer_events_y2024m02 PARTITION OF customer_events FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');
-- Continue for all months...

-- Row Level Security
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

-- Create roles
CREATE ROLE marketing_admin;
CREATE ROLE marketing_analyst;
CREATE ROLE marketing_user;

-- Grant permissions
GRANT ALL ON ALL TABLES IN SCHEMA public TO marketing_admin;
GRANT SELECT, INSERT, UPDATE ON campaigns, campaign_executions TO marketing_user;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO marketing_analyst;

-- Initial data
INSERT INTO segments (name, description, type, criteria) VALUES
('vip_customers', 'High value customers with LTV > $1000', 'dynamic', '{"lifetime_value": {"$gte": 1000}}'::jsonb),
('at_risk', 'Customers who haven''t purchased in 60 days', 'dynamic', '{"last_purchase_days_ago": {"$gte": 60}}'::jsonb),
('new_customers', 'First-time purchasers in last 30 days', 'dynamic', '{"first_purchase_days_ago": {"$lte": 30}}'::jsonb);