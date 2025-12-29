/**
 * Database schema definitions for analytics
 */

export const ANALYTICS_SCHEMA = `
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For text search
CREATE EXTENSION IF NOT EXISTS "btree_gist"; -- For exclusion constraints

-- Create analytics schema
CREATE SCHEMA IF NOT EXISTS analytics;

-- Enum types
CREATE TYPE analytics.event_type AS ENUM (
  'pageview',
  'track',
  'identify',
  'conversion',
  'custom'
);

CREATE TYPE analytics.channel_type AS ENUM (
  'organic',
  'paid',
  'social',
  'email',
  'direct',
  'referral',
  'other'
);

CREATE TYPE analytics.attribution_model_type AS ENUM (
  'first_touch',
  'last_touch',
  'linear',
  'time_decay',
  'position_based',
  'data_driven'
);

-- Main events table (partitioned by month)
CREATE TABLE analytics.events (
  event_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  event_type analytics.event_type NOT NULL,
  event_name VARCHAR(255) NOT NULL,
  user_id VARCHAR(255),
  anonymous_id VARCHAR(255) NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  properties JSONB DEFAULT '{}',
  context JSONB DEFAULT '{}',
  integrations JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (timestamp);

-- Create partitions for the last 12 months and next 3 months
DO $$
DECLARE
  start_date DATE := DATE_TRUNC('month', CURRENT_DATE - INTERVAL '12 months');
  end_date DATE := DATE_TRUNC('month', CURRENT_DATE + INTERVAL '3 months');
  partition_date DATE;
  partition_name TEXT;
BEGIN
  partition_date := start_date;
  WHILE partition_date < end_date LOOP
    partition_name := 'events_' || TO_CHAR(partition_date, 'YYYY_MM');
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS analytics.%I PARTITION OF analytics.events
       FOR VALUES FROM (%L) TO (%L)',
      partition_name,
      partition_date,
      partition_date + INTERVAL '1 month'
    );
    partition_date := partition_date + INTERVAL '1 month';
  END LOOP;
END$$;

-- Indexes on events table
CREATE INDEX idx_events_user_id ON analytics.events (user_id);
CREATE INDEX idx_events_anonymous_id ON analytics.events (anonymous_id);
CREATE INDEX idx_events_timestamp ON analytics.events (timestamp DESC);
CREATE INDEX idx_events_event_name ON analytics.events (event_name);
CREATE INDEX idx_events_properties ON analytics.events USING GIN (properties);
CREATE INDEX idx_events_context ON analytics.events USING GIN (context);

-- User profiles table
CREATE TABLE analytics.user_profiles (
  user_id VARCHAR(255) PRIMARY KEY,
  traits JSONB DEFAULT '{}',
  integrations JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_profiles_traits ON analytics.user_profiles USING GIN (traits);
CREATE INDEX idx_user_profiles_created ON analytics.user_profiles (created_at DESC);

-- Conversion events table
CREATE TABLE analytics.conversions (
  conversion_id UUID PRIMARY KEY REFERENCES analytics.events(event_id),
  user_id VARCHAR(255),
  conversion_value DECIMAL(12, 2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  transaction_id VARCHAR(255),
  items JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conversions_user_id ON analytics.conversions (user_id);
CREATE INDEX idx_conversions_transaction_id ON analytics.conversions (transaction_id);
CREATE INDEX idx_conversions_value ON analytics.conversions (conversion_value DESC);

-- Attribution touchpoints table
CREATE TABLE analytics.attribution_touchpoints (
  touchpoint_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  channel analytics.channel_type NOT NULL,
  campaign VARCHAR(255),
  source VARCHAR(255),
  medium VARCHAR(255),
  event_data JSONB DEFAULT '{}',
  credit DECIMAL(5, 4) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_touchpoints_user_id ON analytics.attribution_touchpoints (user_id);
CREATE INDEX idx_touchpoints_timestamp ON analytics.attribution_touchpoints (timestamp DESC);
CREATE INDEX idx_touchpoints_channel ON analytics.attribution_touchpoints (channel);
CREATE INDEX idx_touchpoints_campaign ON analytics.attribution_touchpoints (campaign);

-- Attribution results table
CREATE TABLE analytics.attribution_results (
  result_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  conversion_id UUID NOT NULL,
  conversion_value DECIMAL(12, 2) NOT NULL,
  model_id VARCHAR(255) NOT NULL,
  model_type analytics.attribution_model_type NOT NULL,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  touchpoint_count INTEGER NOT NULL
);

CREATE INDEX idx_attribution_results_conversion ON analytics.attribution_results (conversion_id);
CREATE INDEX idx_attribution_results_model ON analytics.attribution_results (model_id, model_type);
CREATE INDEX idx_attribution_results_calculated ON analytics.attribution_results (calculated_at DESC);

-- Attribution credits table
CREATE TABLE analytics.attribution_credits (
  credit_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  conversion_id UUID NOT NULL,
  touchpoint_id UUID NOT NULL REFERENCES analytics.attribution_touchpoints(touchpoint_id),
  model_id VARCHAR(255) NOT NULL,
  credit DECIMAL(5, 4) NOT NULL,
  value_attributed DECIMAL(12, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_attribution_credits_unique 
  ON analytics.attribution_credits (conversion_id, touchpoint_id, model_id);
CREATE INDEX idx_attribution_credits_touchpoint ON analytics.attribution_credits (touchpoint_id);

-- Session tracking table
CREATE TABLE analytics.sessions (
  session_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id VARCHAR(255),
  anonymous_id VARCHAR(255) NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  page_views INTEGER DEFAULT 0,
  events_count INTEGER DEFAULT 0,
  bounce BOOLEAN DEFAULT FALSE,
  referrer JSONB DEFAULT '{}',
  device JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_user_id ON analytics.sessions (user_id);
CREATE INDEX idx_sessions_anonymous_id ON analytics.sessions (anonymous_id);
CREATE INDEX idx_sessions_started_at ON analytics.sessions (started_at DESC);

-- GDPR compliance tables
CREATE TABLE analytics.gdpr_requests (
  request_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  request_type VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  result JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_gdpr_requests_user_id ON analytics.gdpr_requests (user_id);
CREATE INDEX idx_gdpr_requests_status ON analytics.gdpr_requests (status);

-- Data retention audit log
CREATE TABLE analytics.data_retention_log (
  log_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  action VARCHAR(50) NOT NULL,
  affected_table VARCHAR(255) NOT NULL,
  records_affected INTEGER NOT NULL,
  criteria JSONB DEFAULT '{}',
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance metrics table
CREATE TABLE analytics.performance_metrics (
  metric_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  metric_name VARCHAR(255) NOT NULL,
  metric_value DECIMAL(12, 4) NOT NULL,
  dimensions JSONB DEFAULT '{}',
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (timestamp);

-- Create monthly partitions for metrics
DO $$
DECLARE
  start_date DATE := DATE_TRUNC('month', CURRENT_DATE);
  end_date DATE := DATE_TRUNC('month', CURRENT_DATE + INTERVAL '3 months');
  partition_date DATE;
  partition_name TEXT;
BEGIN
  partition_date := start_date;
  WHILE partition_date < end_date LOOP
    partition_name := 'performance_metrics_' || TO_CHAR(partition_date, 'YYYY_MM');
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS analytics.%I PARTITION OF analytics.performance_metrics
       FOR VALUES FROM (%L) TO (%L)',
      partition_name,
      partition_date,
      partition_date + INTERVAL '1 month'
    );
    partition_date := partition_date + INTERVAL '1 month';
  END LOOP;
END$$;

-- Create hypertable for time-series optimization (if TimescaleDB is available)
-- SELECT create_hypertable('analytics.events', 'timestamp', if_not_exists => TRUE);
-- SELECT create_hypertable('analytics.performance_metrics', 'timestamp', if_not_exists => TRUE);

-- Create update trigger for updated_at columns
CREATE OR REPLACE FUNCTION analytics.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_user_profiles_updated_at 
  BEFORE UPDATE ON analytics.user_profiles 
  FOR EACH ROW EXECUTE FUNCTION analytics.update_updated_at_column();

CREATE TRIGGER update_attribution_touchpoints_updated_at 
  BEFORE UPDATE ON analytics.attribution_touchpoints 
  FOR EACH ROW EXECUTE FUNCTION analytics.update_updated_at_column();
`;

/**
 * Database indices for performance optimization
 */
export const PERFORMANCE_INDICES = `
-- Additional performance indices
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_user_timestamp 
  ON analytics.events (user_id, timestamp DESC) 
  WHERE user_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_name_timestamp 
  ON analytics.events (event_name, timestamp DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_touchpoints_user_channel_timestamp 
  ON analytics.attribution_touchpoints (user_id, channel, timestamp DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversions_timestamp 
  ON analytics.conversions (created_at DESC) 
  INCLUDE (user_id, conversion_value);

-- Text search indices
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_search 
  ON analytics.events 
  USING GIN (to_tsvector('english', event_name));
`;

/**
 * Database maintenance procedures
 */
export const MAINTENANCE_PROCEDURES = `
-- Procedure to create new monthly partitions
CREATE OR REPLACE PROCEDURE analytics.create_monthly_partitions(
  table_name TEXT,
  months_ahead INTEGER DEFAULT 3
)
LANGUAGE plpgsql
AS $$
DECLARE
  start_date DATE := DATE_TRUNC('month', CURRENT_DATE);
  end_date DATE := DATE_TRUNC('month', CURRENT_DATE + (months_ahead || ' months')::INTERVAL);
  partition_date DATE;
  partition_name TEXT;
BEGIN
  partition_date := start_date;
  WHILE partition_date < end_date LOOP
    partition_name := table_name || '_' || TO_CHAR(partition_date, 'YYYY_MM');
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS analytics.%I PARTITION OF analytics.%I
       FOR VALUES FROM (%L) TO (%L)',
      partition_name,
      table_name,
      partition_date,
      partition_date + INTERVAL '1 month'
    );
    partition_date := partition_date + INTERVAL '1 month';
  END LOOP;
END;
$$;

-- Procedure to drop old partitions
CREATE OR REPLACE PROCEDURE analytics.drop_old_partitions(
  table_name TEXT,
  months_to_keep INTEGER DEFAULT 12
)
LANGUAGE plpgsql
AS $$
DECLARE
  cutoff_date DATE := DATE_TRUNC('month', CURRENT_DATE - (months_to_keep || ' months')::INTERVAL);
  partition_record RECORD;
BEGIN
  FOR partition_record IN 
    SELECT tablename 
    FROM pg_tables 
    WHERE schemaname = 'analytics' 
      AND tablename LIKE table_name || '_%'
  LOOP
    IF partition_record.tablename < table_name || '_' || TO_CHAR(cutoff_date, 'YYYY_MM') THEN
      EXECUTE format('DROP TABLE IF EXISTS analytics.%I', partition_record.tablename);
      RAISE NOTICE 'Dropped partition %', partition_record.tablename;
    END IF;
  END LOOP;
END;
$$;
`;