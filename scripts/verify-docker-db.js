#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');

// Use Docker PostgreSQL connection
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://warehouse:warehouse123@localhost:5433/warehouse_network'
    }
  }
});

async function verifyDatabase() {
  console.log('🔍 Verifying Docker PostgreSQL connection and schema...\n');

  try {
    // Test connection
    await prisma.$connect();
    console.log('✅ Successfully connected to Docker PostgreSQL\n');

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

    console.log('📊 Table Record Counts:\n');
    console.log('Table Name                    | Count');
    console.log('------------------------------|-------');

    for (const table of tables) {
      try {
        const count = await prisma[table.charAt(0).toLowerCase() + table.slice(1)].count();
        console.log(`${table.padEnd(29)} | ${count}`);
      } catch (error) {
        console.log(`${table.padEnd(29)} | Error: ${error.message}`);
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

    console.log('\n📈 Table Sizes:\n');
    console.log('Table Name                    | Size');
    console.log('------------------------------|-------');
    
    result.forEach(row => {
      console.log(`${row.table_name.padEnd(29)} | ${row.size}`);
    });

    // Test a simple query
    const userCount = await prisma.user.count();
    const operatorCount = await prisma.operator.count();
    const warehouseCount = await prisma.warehouse.count();

    console.log('\n📌 Summary:');
    console.log(`- Total Users: ${userCount}`);
    console.log(`- Total Operators: ${operatorCount}`);
    console.log(`- Total Warehouses: ${warehouseCount}`);
    console.log(`- Total Tables: ${result.length}`);

    console.log('\n✨ Database verification completed successfully!');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run verification
verifyDatabase().catch(console.error);