import { readFileSync } from 'fs';
import { join } from 'path';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { logger } from './utils/logger';

dotenv.config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'marketing_user',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'marketing_engine'
});

async function migrate() {
  logger.info('Running database migrations...');

  try {
    // Read schema file
    const schemaPath = join(__dirname, '..', 'src', 'db', 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf8');

    // Execute schema
    await pool.query(schema);

    logger.info('Database migrations completed successfully');
  } catch (error) {
    logger.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  migrate();
}