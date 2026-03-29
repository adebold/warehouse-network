-- Analytics and Business Intelligence Schema Extension
-- Skidspace.com Warehouse Marketplace Analytics System

-- =============================================================================
-- WAREHOUSE CORE MODELS
-- =============================================================================

CREATE TABLE IF NOT EXISTS warehouses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    address JSONB NOT NULL,
    coordinates POINT,
    total_capacity BIGINT NOT NULL,
    available_capacity BIGINT NOT NULL,
    price_per_sq_ft DECIMAL(10,2),
    amenities JSONB DEFAULT '[]',
    operating_hours JSONB DEFAULT '{}',
    contact_info JSONB DEFAULT '{}',
    status VARCHAR(50) DEFAULT 'active',
    verification_status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS warehouse_spaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    space_type VARCHAR(100) NOT NULL, -- storage, office, loading_dock, etc
    dimensions JSONB NOT NULL, -- length, width, height
    capacity BIGINT NOT NULL,
    price_per_sq_ft DECIMAL(10,2),
    amenities JSONB DEFAULT '[]',
    is_climate_controlled BOOLEAN DEFAULT false,
    is_secure BOOLEAN DEFAULT false,
    status VARCHAR(50) DEFAULT 'available',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================================================
-- BOOKING AND TRANSACTION MODELS
-- =============================================================================

CREATE TABLE IF NOT EXISTS bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    space_id UUID NOT NULL REFERENCES warehouse_spaces(id) ON DELETE CASCADE,

    -- Booking details
    booking_type VARCHAR(50) NOT NULL, -- short_term, long_term, on_demand
    start_date DATE NOT NULL,
    end_date DATE,
    duration_days INTEGER,
    square_footage DECIMAL(10,2) NOT NULL,

    -- Pricing
    base_rate DECIMAL(10,2) NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',

    -- Status
    status VARCHAR(50) DEFAULT 'pending',
    payment_status VARCHAR(50) DEFAULT 'pending',

    -- Metadata
    special_requirements JSONB DEFAULT '{}',
    booking_metadata JSONB DEFAULT '{}',

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Transaction details
    transaction_type VARCHAR(50) NOT NULL, -- booking, refund, fee, commission
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    status VARCHAR(50) NOT NULL,

    -- Payment processing
    payment_method VARCHAR(50),
    payment_processor VARCHAR(50),
    external_transaction_id VARCHAR(255),
    processor_fee DECIMAL(10,2),
    platform_fee DECIMAL(10,2),

    -- Metadata
    description TEXT,
    transaction_metadata JSONB DEFAULT '{}',

    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================================================
-- ANALYTICS EVENTS AND TRACKING
-- =============================================================================

CREATE TABLE IF NOT EXISTS analytics_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    session_id VARCHAR(255),

    -- Event classification
    event_name VARCHAR(255) NOT NULL,
    event_category VARCHAR(100) NOT NULL, -- user_action, system, business, error
    event_type VARCHAR(100) NOT NULL, -- click, view, booking, search, etc

    -- Event context
    page_url TEXT,
    referrer TEXT,
    user_agent TEXT,
    ip_address INET,
    device_type VARCHAR(50),
    browser VARCHAR(100),
    os VARCHAR(100),

    -- Event data
    event_properties JSONB DEFAULT '{}',
    custom_properties JSONB DEFAULT '{}',

    -- Business context
    warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL,
    booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id VARCHAR(255) UNIQUE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

    -- Session metadata
    ip_address INET,
    user_agent TEXT,
    device_type VARCHAR(50),
    browser VARCHAR(100),
    os VARCHAR(100),

    -- Session tracking
    entry_page TEXT,
    exit_page TEXT,
    page_views INTEGER DEFAULT 0,
    session_duration INTEGER, -- seconds
    is_bounce BOOLEAN DEFAULT false,
    conversion_events JSONB DEFAULT '[]',

    -- Geographic data
    country VARCHAR(2),
    region VARCHAR(100),
    city VARCHAR(100),

    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ended_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================================================
-- BUSINESS INTELLIGENCE AGGREGATIONS
-- =============================================================================

CREATE TABLE IF NOT EXISTS daily_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    metric_date DATE NOT NULL,

    -- User metrics
    active_users INTEGER DEFAULT 0,
    new_users INTEGER DEFAULT 0,
    returning_users INTEGER DEFAULT 0,
    total_sessions INTEGER DEFAULT 0,
    avg_session_duration DECIMAL(10,2) DEFAULT 0,
    bounce_rate DECIMAL(5,2) DEFAULT 0,

    -- Business metrics
    total_bookings INTEGER DEFAULT 0,
    successful_bookings INTEGER DEFAULT 0,
    cancelled_bookings INTEGER DEFAULT 0,
    total_revenue DECIMAL(15,2) DEFAULT 0,
    gross_revenue DECIMAL(15,2) DEFAULT 0,
    net_revenue DECIMAL(15,2) DEFAULT 0,
    avg_booking_value DECIMAL(10,2) DEFAULT 0,

    -- Warehouse metrics
    total_warehouse_views INTEGER DEFAULT 0,
    total_warehouse_inquiries INTEGER DEFAULT 0,
    warehouse_conversion_rate DECIMAL(5,2) DEFAULT 0,
    occupancy_rate DECIMAL(5,2) DEFAULT 0,

    -- Platform metrics
    platform_fee_collected DECIMAL(15,2) DEFAULT 0,
    payment_processing_fees DECIMAL(15,2) DEFAULT 0,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(tenant_id, metric_date)
);

CREATE TABLE IF NOT EXISTS warehouse_performance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    metric_date DATE NOT NULL,

    -- Performance metrics
    total_views INTEGER DEFAULT 0,
    total_inquiries INTEGER DEFAULT 0,
    total_bookings INTEGER DEFAULT 0,
    total_revenue DECIMAL(15,2) DEFAULT 0,
    occupancy_rate DECIMAL(5,2) DEFAULT 0,

    -- Utilization metrics
    space_utilization DECIMAL(5,2) DEFAULT 0,
    avg_booking_duration DECIMAL(10,2) DEFAULT 0,
    booking_conversion_rate DECIMAL(5,2) DEFAULT 0,

    -- Customer satisfaction
    avg_rating DECIMAL(3,2),
    total_reviews INTEGER DEFAULT 0,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(warehouse_id, metric_date)
);

-- =============================================================================
-- CUSTOMER BEHAVIOR TRACKING
-- =============================================================================

CREATE TABLE IF NOT EXISTS customer_journeys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    session_id VARCHAR(255),

    -- Journey tracking
    touchpoints JSONB DEFAULT '[]', -- Array of touchpoint objects
    conversion_events JSONB DEFAULT '[]',
    journey_stage VARCHAR(100), -- awareness, consideration, intent, purchase, retention

    -- Journey metrics
    total_touchpoints INTEGER DEFAULT 0,
    journey_duration INTEGER, -- seconds from first to last touchpoint
    converted BOOLEAN DEFAULT false,
    conversion_value DECIMAL(10,2),

    -- Attribution
    first_touch_channel VARCHAR(100),
    last_touch_channel VARCHAR(100),
    attribution_model VARCHAR(50) DEFAULT 'last_click',

    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS funnel_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    funnel_name VARCHAR(255) NOT NULL,

    -- Funnel configuration
    funnel_steps JSONB NOT NULL, -- Array of step definitions
    date_range_start DATE NOT NULL,
    date_range_end DATE NOT NULL,

    -- Funnel metrics
    total_entries INTEGER DEFAULT 0,
    step_completions JSONB DEFAULT '{}', -- Step completion counts
    conversion_rates JSONB DEFAULT '{}', -- Step-to-step conversion rates
    drop_off_rates JSONB DEFAULT '{}',
    overall_conversion_rate DECIMAL(5,2) DEFAULT 0,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================================================
-- ALERTS AND MONITORING
-- =============================================================================

CREATE TABLE IF NOT EXISTS alert_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

    -- Rule definition
    rule_name VARCHAR(255) NOT NULL,
    description TEXT,
    metric_name VARCHAR(255) NOT NULL,
    condition_type VARCHAR(50) NOT NULL, -- greater_than, less_than, equals, change_rate
    threshold_value DECIMAL(15,2) NOT NULL,
    comparison_period VARCHAR(50), -- hour, day, week, month

    -- Alert configuration
    severity VARCHAR(50) DEFAULT 'medium', -- low, medium, high, critical
    is_active BOOLEAN DEFAULT true,
    notification_channels JSONB DEFAULT '[]', -- email, sms, slack, webhook

    -- Execution settings
    evaluation_frequency VARCHAR(50) DEFAULT 'hourly', -- minutely, hourly, daily
    suppress_duration INTEGER DEFAULT 3600, -- seconds to suppress repeat alerts

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alert_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    alert_rule_id UUID REFERENCES alert_rules(id) ON DELETE CASCADE,

    -- Alert details
    alert_level VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    metric_value DECIMAL(15,2),
    threshold_value DECIMAL(15,2),

    -- Notification tracking
    notification_channels JSONB DEFAULT '[]',
    delivery_status JSONB DEFAULT '{}', -- Channel-specific delivery status
    acknowledged BOOLEAN DEFAULT false,
    acknowledged_by UUID REFERENCES users(id) ON DELETE SET NULL,
    acknowledged_at TIMESTAMP WITH TIME ZONE,

    -- Resolution tracking
    resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolution_notes TEXT,

    triggered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================================================
-- REVENUE ANALYTICS AND FORECASTING
-- =============================================================================

CREATE TABLE IF NOT EXISTS revenue_forecasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

    -- Forecast configuration
    forecast_name VARCHAR(255) NOT NULL,
    forecast_type VARCHAR(50) NOT NULL, -- revenue, bookings, users
    time_period VARCHAR(50) NOT NULL, -- daily, weekly, monthly, quarterly
    forecast_horizon INTEGER NOT NULL, -- number of periods to forecast

    -- Model information
    model_type VARCHAR(100) NOT NULL, -- linear_regression, arima, prophet, etc
    model_parameters JSONB DEFAULT '{}',
    training_data_period INTEGER, -- days of historical data used
    model_accuracy DECIMAL(5,2), -- accuracy score from validation

    -- Forecast data
    historical_data JSONB, -- Array of historical data points
    forecast_data JSONB, -- Array of forecasted values with confidence intervals

    -- Metadata
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    valid_until TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cohort_analysis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

    -- Cohort definition
    cohort_name VARCHAR(255) NOT NULL,
    cohort_type VARCHAR(50) NOT NULL, -- user_acquisition, first_purchase, etc
    cohort_period VARCHAR(50) NOT NULL, -- daily, weekly, monthly

    -- Time range
    cohort_start_date DATE NOT NULL,
    cohort_end_date DATE NOT NULL,
    analysis_periods INTEGER NOT NULL, -- number of periods to analyze

    -- Cohort data
    cohort_sizes JSONB DEFAULT '{}', -- Initial size of each cohort
    retention_data JSONB DEFAULT '{}', -- Retention rates over time
    revenue_data JSONB DEFAULT '{}', -- Revenue per cohort over time

    -- Analysis metadata
    total_cohorts INTEGER DEFAULT 0,
    avg_retention_rate DECIMAL(5,2),
    avg_lifetime_value DECIMAL(10,2),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================================================
-- PERFORMANCE MONITORING
-- =============================================================================

CREATE TABLE IF NOT EXISTS system_performance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- System metrics
    metric_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    cpu_usage DECIMAL(5,2),
    memory_usage DECIMAL(5,2),
    disk_usage DECIMAL(5,2),
    network_io JSONB DEFAULT '{}',

    -- Database performance
    db_connections INTEGER,
    db_slow_queries INTEGER,
    db_avg_response_time DECIMAL(10,3),

    -- Application performance
    api_requests_per_second DECIMAL(10,2),
    api_avg_response_time DECIMAL(10,3),
    api_error_rate DECIMAL(5,2),
    active_sessions INTEGER,

    -- Business metrics
    concurrent_bookings INTEGER,
    search_queries_per_second DECIMAL(10,2),
    payment_success_rate DECIMAL(5,2),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

-- Analytics events indexes
CREATE INDEX IF NOT EXISTS idx_analytics_events_tenant_created ON analytics_events(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_created ON analytics_events(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_category_type ON analytics_events(event_category, event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_events_warehouse ON analytics_events(warehouse_id, created_at);

-- User sessions indexes
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_started ON user_sessions(user_id, started_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_tenant_started ON user_sessions(tenant_id, started_at);

-- Daily metrics indexes
CREATE INDEX IF NOT EXISTS idx_daily_metrics_tenant_date ON daily_metrics(tenant_id, metric_date);

-- Warehouse performance indexes
CREATE INDEX IF NOT EXISTS idx_warehouse_performance_warehouse_date ON warehouse_performance(warehouse_id, metric_date);

-- Bookings indexes for analytics
CREATE INDEX IF NOT EXISTS idx_bookings_tenant_created ON bookings(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_bookings_warehouse_created ON bookings(warehouse_id, created_at);
CREATE INDEX IF NOT EXISTS idx_bookings_status_created ON bookings(status, created_at);

-- Transactions indexes for analytics
CREATE INDEX IF NOT EXISTS idx_transactions_tenant_created ON transactions(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_type_status ON transactions(transaction_type, status);
CREATE INDEX IF NOT EXISTS idx_transactions_processed_at ON transactions(processed_at);

-- Customer journeys indexes
CREATE INDEX IF NOT EXISTS idx_customer_journeys_user_started ON customer_journeys(user_id, started_at);
CREATE INDEX IF NOT EXISTS idx_customer_journeys_tenant_stage ON customer_journeys(tenant_id, journey_stage);

-- Alert rules and notifications indexes
CREATE INDEX IF NOT EXISTS idx_alert_rules_tenant_active ON alert_rules(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_alert_notifications_tenant_triggered ON alert_notifications(tenant_id, triggered_at);

-- Performance monitoring indexes
CREATE INDEX IF NOT EXISTS idx_system_performance_timestamp ON system_performance(metric_timestamp);