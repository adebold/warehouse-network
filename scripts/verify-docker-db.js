#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');
const { logger } = require('./utils/logger');

// Use Docker PostgreSQL connection
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://warehouse:warehouse123@localhost:5433/warehouse_network'
    }
  }
});

async function verifyDatabase() {
  logger.info('🔍 Verifying Docker PostgreSQL connection and schema...\n');

  try {
    // Test connection
    await prisma.$connect();
    logger.info('✅ Successfully connected to Docker PostgreSQL\n');

    // Get all table counts
    const tables = [
      'User', 'Account', 'Session', 'VerificationToken',
      'Operator', 'OperatorUser', 'Warehouse', 'WarehouseImage',
      'WarehouseFeature', 'PricingRule', 'Customer', 'Lead',
      'Quote', 'QuoteItem', 'RFQ', 'ChargeLine', 'Deposit',
      'Skid', 'ReceivingOrder', 'Location', 'Platform',
      'OperatorLedgerEntry', 'Payout', 'Dispute', 'SkidsOnDisputes',
      'ReleaseRequest', 'SkidsOnReleaseRequests', 'Credit',
      'Invitation', 'Notification', 'Referral', 'CityPage',
      'SearchHistory', 'OperatorTrustScore', 'WarehouseQualityScore',
      'JobRun', 'AuditEvent', 'IntegrityLog', 'IntegrityAlert',
      'IntegrityMetric', 'IntegritySnapshot', 'AIInteraction',
      'AccountLockHistory'
    ];

    logger.info('📊 Table Record Counts:\n');
    logger.info('Table Name                    | Count');
    logger.info('------------------------------|-------');

    for (const table of tables) {
      try {
        const count = await prisma[table.charAt(0).toLowerCase() + table.slice(1)].count();
        logger.info(`${table.padEnd(29)} | ${count}`);
      } catch (error) {
        logger.info(`${table.padEnd(29)} | Error: ${error.message}`);
      }
    }

    // Check database metadata
    const result = await prisma.$queryRaw`
      SELECT 
        tablename as table_name,
        pg_size_pretty(pg_total_relation_size('"'||schemaname||'"."'||tablename||'"')) as size
      FROM pg_tables 
      WHERE schemaname = 'public' 
      ORDER BY tablename;
    `;

    logger.info('\n📈 Table Sizes:\n');
    logger.info('Table Name                    | Size');
    logger.info('------------------------------|-------');
    
    result.forEach(row => {
      logger.info(`${row.table_name.padEnd(29)} | ${row.size}`);
    });

    // Test a simple query
    const userCount = await prisma.user.count();
    const operatorCount = await prisma.operator.count();
    const warehouseCount = await prisma.warehouse.count();

    logger.info('\n📌 Summary:');
    logger.info(`- Total Users: ${userCount}`);
    logger.info(`- Total Operators: ${operatorCount}`);
    logger.info(`- Total Warehouses: ${warehouseCount}`);
    logger.info(`- Total Tables: ${result.length}`);

    logger.info('\n✨ Database verification completed successfully!');

  } catch (error) {
    logger.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run verification
verifyDatabase().catch(console.error);