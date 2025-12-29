#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');

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
  console.log('🧪 Testing Prisma connection to Docker PostgreSQL...\n');

  try {
    // Test 1: Basic connection
    console.log('📡 Test 1: Basic connection test...');
    await prisma.$connect();
    console.log('✅ Successfully connected to Docker PostgreSQL\n');

    // Test 2: Query execution
    console.log('📊 Test 2: Query execution test...');
    const startTime = Date.now();
    
    const [users, operators, warehouses] = await Promise.all([
      prisma.user.findMany({ take: 5 }),
      prisma.operator.findMany({ include: { warehouses: true } }),
      prisma.warehouse.findMany({ include: { features: true, images: true } })
    ]);
    
    const queryTime = Date.now() - startTime;
    console.log(`✅ Queries executed successfully in ${queryTime}ms\n`);

    // Test 3: Complex query with joins
    console.log('🔗 Test 3: Complex query test...');
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
    console.log(`✅ Found ${quotes.length} quotes with related data\n`);

    // Test 4: Transaction test
    console.log('💱 Test 4: Transaction test...');
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
      console.log('✅ Transaction completed successfully\n');
    });

    // Test 5: Raw SQL query
    console.log('📝 Test 5: Raw SQL query test...');
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
    
    console.log('✅ Top tables by size:');
    tableStats.forEach(stat => {
      console.log(`   - ${stat.tablename}: ${stat.size} (${stat.row_count} rows)`);
    });

    // Summary
    console.log('\n📈 Connection Test Summary:');
    console.log(`- Total Users: ${users.length}`);
    console.log(`- Total Operators: ${operators.length}`);
    console.log(`- Total Warehouses: ${warehouses.length}`);
    console.log(`- Connection URL: postgresql://warehouse:****@localhost:5433/warehouse_network`);
    console.log('\n✨ All tests passed successfully!');

    // Display sample data
    if (warehouses.length > 0) {
      console.log('\n🏢 Sample Warehouse:');
      const warehouse = warehouses[0];
      console.log(`- Name: ${warehouse.name}`);
      console.log(`- Location: ${warehouse.city}, ${warehouse.province}`);
      console.log(`- Features: ${warehouse.features.map(f => f.feature).join(', ')}`);
      console.log(`- Images: ${warehouse.images.length}`);
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error('\n💡 Troubleshooting tips:');
    console.error('1. Ensure Docker PostgreSQL is running: docker ps | grep warehouse-postgres');
    console.error('2. Check if port 5433 is available: lsof -i :5433');
    console.error('3. Verify credentials in docker-compose.yml');
    console.error('4. Run migrations: ./scripts/docker-migrate.sh');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
testConnection().catch(console.error);