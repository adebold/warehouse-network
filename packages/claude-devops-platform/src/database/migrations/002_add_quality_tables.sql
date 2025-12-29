-- Quality check records
CREATE TABLE IF NOT EXISTS code_quality_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id VARCHAR(255) NOT NULL,
  commit_hash VARCHAR(40),
  branch VARCHAR(255),
  report JSONB NOT NULL,
  score JSONB NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  passed BOOLEAN NOT NULL,
  blockers JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for project lookups
CREATE INDEX idx_quality_checks_project_id ON code_quality_checks(project_id);
CREATE INDEX idx_quality_checks_timestamp ON code_quality_checks(timestamp DESC);
CREATE INDEX idx_quality_checks_passed ON code_quality_checks(passed);

-- Quality rollback triggers
CREATE TABLE IF NOT EXISTS quality_rollback_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id VARCHAR(255) NOT NULL,
  deployment_id UUID NOT NULL,
  thresholds JSONB NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for active triggers
CREATE INDEX idx_rollback_triggers_active ON quality_rollback_triggers(project_id, deployment_id) WHERE active = true;

-- Update deployments table to include quality fields
ALTER TABLE deployments 
  ADD COLUMN IF NOT EXISTS quality_check_id UUID,
  ADD COLUMN IF NOT EXISTS quality_score DECIMAL(3,1),
  ADD COLUMN IF NOT EXISTS quality_passed BOOLEAN;

-- Add foreign key constraint
ALTER TABLE deployments
  ADD CONSTRAINT fk_deployments_quality_check
  FOREIGN KEY (quality_check_id) 
  REFERENCES code_quality_checks(id)
  ON DELETE SET NULL;

-- Update pipeline_executions table for quality fields
ALTER TABLE pipeline_executions
  ADD COLUMN IF NOT EXISTS quality_check_id UUID,
  ADD COLUMN IF NOT EXISTS quality_score DECIMAL(3,1),
  ADD COLUMN IF NOT EXISTS quality_passed BOOLEAN;

-- Add foreign key constraint for pipelines
ALTER TABLE pipeline_executions
  ADD CONSTRAINT fk_pipeline_executions_quality_check
  FOREIGN KEY (quality_check_id)
  REFERENCES code_quality_checks(id)
  ON DELETE SET NULL;

-- Quality metrics aggregation table
CREATE TABLE IF NOT EXISTS quality_metrics_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id VARCHAR(255) NOT NULL,
  date DATE NOT NULL,
  avg_score DECIMAL(3,1),
  min_score DECIMAL(3,1),
  max_score DECIMAL(3,1),
  total_checks INTEGER,
  passed_checks INTEGER,
  failed_checks INTEGER,
  avg_security_score DECIMAL(3,1),
  avg_complexity_score DECIMAL(3,1),
  avg_coverage_score DECIMAL(3,1),
  avg_duplication_score DECIMAL(3,1),
  avg_performance_score DECIMAL(3,1),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Unique constraint for daily aggregation
CREATE UNIQUE INDEX idx_quality_metrics_daily_unique ON quality_metrics_daily(project_id, date);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_code_quality_checks_updated_at BEFORE UPDATE ON code_quality_checks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_quality_rollback_triggers_updated_at BEFORE UPDATE ON quality_rollback_triggers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();