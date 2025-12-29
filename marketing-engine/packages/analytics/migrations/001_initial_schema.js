/**
 * Initial database schema migration
 */

const { ANALYTICS_SCHEMA, PERFORMANCE_INDICES, MAINTENANCE_PROCEDURES } = require('../dist/database/schema');
const { logger } = require('../../../../../../../utils/logger');

exports.up = async (pgm) => {
  // Execute main schema
  pgm.sql(ANALYTICS_SCHEMA);
  
  // Add performance indices
  pgm.sql(PERFORMANCE_INDICES);
  
  // Add maintenance procedures
  pgm.sql(MAINTENANCE_PROCEDURES);
  
  logger.info('Analytics schema created successfully');
};

exports.down = (pgm) => {
  // Drop schema and all objects
  pgm.sql('DROP SCHEMA IF EXISTS analytics CASCADE');
  
  // Drop types
  pgm.sql('DROP TYPE IF EXISTS analytics.event_type CASCADE');
  pgm.sql('DROP TYPE IF EXISTS analytics.channel_type CASCADE');
  pgm.sql('DROP TYPE IF EXISTS analytics.attribution_model_type CASCADE');
  
  logger.info('Analytics schema dropped');
};