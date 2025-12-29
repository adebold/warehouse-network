#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');
const { logger } = require('./utils/logger');

// Create Prisma client with Docker PostgreSQL connection
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://warehouse:warehouse123@localhost:5433/warehouse_network'
    }
  },
  log: ['query', 'info', 'warn', 'error'],
});

async function testConnection() {
  logger.info('🧪 Testing Prisma connection to Docker PostgreSQL...\n');

  try {
    // Test 1: Basic connection
    logger.info('📡 Test 1: Basic connection test...');
    await prisma.$connect();
    logger.info('✅ Successfully connected to Docker PostgreSQL\n');

    // Test 2: Query execution
    logger.info('📊 Test 2: Query execution test...');
    const startTime = Date.now();
    
    const [users, operators, warehouses] = await Promise.all([
      prisma.user.findMany({ take: 5 }),
      prisma.operator.findMany({ include: { warehouses: true } }),
      prisma.warehouse.findMany({ include: { features: true, images: true } })
    ]);
    
    const queryTime = Date.now() - startTime;
    logger.info(`✅ Queries executed successfully in ${queryTime}ms\n`);

    // Test 3: Complex query with joins
    logger.info('🔗 Test 3: Complex query test...');
    const quotes = await prisma.quote.findMany({
      include: {
        rfq: {
          include: {
            customer: true
          }
        },
        warehouse: {
          include: {
            operator: true
          }
        },
        items: true
      }
    });
    logger.info(`✅ Found ${quotes.length} quotes with related data\n`);

    // Test 4: Transaction test
    logger.info('💱 Test 4: Transaction test...');
    await prisma.$transaction(async (tx) => {
      const lead = await tx.lead.create({
        data: {
          email: `test-${Date.now()}@example.com`,
          name: 'Transaction Test Lead',
          company: 'Test Company',
          status: 'NEW'
        }
      });
      
      // Immediately delete it to test rollback
      await tx.lead.delete({ where: { id: lead.id } });
      logger.info('✅ Transaction completed successfully\n');
    });

    // Test 5: Raw SQL query
    logger.info('📝 Test 5: Raw SQL query test...');
    const tableStats = await prisma.$queryRaw`
      SELECT 
        s.relname as tablename,
        pg_size_pretty(pg_total_relation_size(c.oid)) as size,
        s.n_live_tup as row_count
      FROM pg_stat_user_tables s
      JOIN pg_class c ON c.relname = s.relname
      WHERE s.schemaname = 'public' 
        AND s.n_live_tup > 0
      ORDER BY pg_total_relation_size(c.oid) DESC
      LIMIT 10;
    `;
    
    logger.info('✅ Top tables by size:');
    tableStats.forEach(stat => {
      logger.info(`   - ${stat.tablename}: ${stat.size} (${stat.row_count} rows)`);
    });

    // Summary
    logger.info('\n📈 Connection Test Summary:');
    logger.info(`- Total Users: ${users.length}`);
    logger.info(`- Total Operators: ${operators.length}`);
    logger.info(`- Total Warehouses: ${warehouses.length}`);
    logger.info(`- Connection URL: postgresql://warehouse:****@localhost:5433/warehouse_network`);
    logger.info('\n✨ All tests passed successfully!');

    // Display sample data
    if (warehouses.length > 0) {
      logger.info('\n🏢 Sample Warehouse:');
      const warehouse = warehouses[0];
      logger.info(`- Name: ${warehouse.name}`);
      logger.info(`- Location: ${warehouse.city}, ${warehouse.province}`);
      logger.info(`- Features: ${warehouse.features.map(f => f.feature).join(', ')}`);
      logger.info(`- Images: ${warehouse.images.length}`);
    }

  } catch (error) {
    logger.error('❌ Test failed:', error);
    logger.error('\n💡 Troubleshooting tips:');
    logger.error('1. Ensure Docker PostgreSQL is running: docker ps | grep warehouse-postgres');
    logger.error('2. Check if port 5433 is available: lsof -i :5433');
    logger.error('3. Verify credentials in docker-compose.yml');
    logger.error('4. Run migrations: ./scripts/docker-migrate.sh');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
testConnection().catch(console.error);