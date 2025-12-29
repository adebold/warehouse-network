import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { subDays } from 'date-fns';
import { logger } from './utils/logger';

const prisma = new PrismaClient();

interface TestScenario {
  name: string;
  accountStatus: 'ACTIVE' | 'SUSPENDED' | 'LOCKED';
  paymentStatus: 'CURRENT' | 'OVERDUE' | 'DELINQUENT';
  overdueAmount: number;
  totalOutstanding: number;
  paymentDueDate: Date | null;
  lockReason?: string;
  lockedAt?: Date;
  skidCount: number;
}

const testScenarios: TestScenario[] = [
  {
    name: 'Active Customer - Good Standing',
    accountStatus: 'ACTIVE',
    paymentStatus: 'CURRENT',
    overdueAmount: 0,
    totalOutstanding: 0,
    paymentDueDate: null,
    skidCount: 5,
  },
  {
    name: 'Overdue Customer - 15 Days',
    accountStatus: 'ACTIVE',
    paymentStatus: 'OVERDUE',
    overdueAmount: 1500.0,
    totalOutstanding: 2500.0,
    paymentDueDate: subDays(new Date(), 15),
    skidCount: 3,
  },
  {
    name: 'Delinquent Customer - 45 Days',
    accountStatus: 'ACTIVE',
    paymentStatus: 'DELINQUENT',
    overdueAmount: 5000.0,
    totalOutstanding: 8500.0,
    paymentDueDate: subDays(new Date(), 45),
    skidCount: 8,
  },
  {
    name: 'Locked Customer - Non-payment',
    accountStatus: 'LOCKED',
    paymentStatus: 'DELINQUENT',
    overdueAmount: 10000.0,
    totalOutstanding: 10000.0,
    paymentDueDate: subDays(new Date(), 60),
    lockReason: 'Payment overdue 60+ days',
    lockedAt: subDays(new Date(), 5),
    skidCount: 12,
  },
  {
    name: 'Suspended Customer',
    accountStatus: 'SUSPENDED',
    paymentStatus: 'OVERDUE',
    overdueAmount: 3000.0,
    totalOutstanding: 4500.0,
    paymentDueDate: subDays(new Date(), 30),
    skidCount: 6,
  },
];

async function seed() {
  logger.info('🌱 Starting test database seed...');

  // Clear existing test data
  await prisma.accountLockHistory.deleteMany({});
  await prisma.releaseRequest.deleteMany({});
  await prisma.skid.deleteMany({});
  await prisma.user.deleteMany({ where: { isTestUser: true } });
  await prisma.customer.deleteMany({ where: { isTestData: true } });
  await prisma.warehouse.deleteMany({});
  await prisma.operator.deleteMany({});
  await prisma.platform.deleteMany({});

  logger.info('✅ Cleared existing test data');

  // Create platform
  const platform = await prisma.platform.create({
    data: {
      name: 'Test Platform',
    },
  });

  // Create operator
  const operator = await prisma.operator.create({
    data: {
      legalName: 'Test Warehouse Operator',
      platformId: platform.id,
      status: 'ACTIVE',
      registrationDetails: 'Test operator for E2E tests',
      primaryContact: 'operator@test.com',
      operatingRegions: 'North America',
      warehouseCount: 3,
      goodsCategories: 'General Goods',
      insuranceAcknowledged: true,
      termsAccepted: true,
      termsAcceptedAt: new Date(),
    },
  });

  // Create warehouses
  const warehouses = await Promise.all([
    prisma.warehouse.create({
      data: {
        name: 'Test Warehouse 1',
        location: 'New York, NY',
        address: '123 Test St',
        city: 'New York',
        province: 'NY',
        postalCode: '10001',
        latitude: 40.7128,
        longitude: -74.006,
        totalSpace: 50000,
        operatingHours: '24/7',
        capacity: 1000,
        supportedGoods: ['Electronics', 'General Merchandise'],
        dockAccessInstructions: 'Use Dock A for deliveries',
        status: 'ACTIVE',
        operatorId: operator.id,
      },
    }),
    prisma.warehouse.create({
      data: {
        name: 'Test Warehouse 2',
        location: 'Los Angeles, CA',
        address: '456 Demo Ave',
        city: 'Los Angeles',
        province: 'CA',
        postalCode: '90001',
        latitude: 34.0522,
        longitude: -118.2437,
        totalSpace: 75000,
        operatingHours: '6 AM - 10 PM',
        capacity: 1500,
        supportedGoods: ['Food', 'Beverages', 'Dry Goods'],
        dockAccessInstructions: 'Check in at security first',
        status: 'ACTIVE',
        operatorId: operator.id,
      },
    }),
  ]);

  logger.info('✅ Created test warehouses');

  // Create admin user
  const adminUser = await prisma.user.create({
    data: {
      email: process.env.TEST_ADMIN_EMAIL || 'admin@test.com',
      name: 'Test Admin',
      password: await bcrypt.hash(process.env.TEST_ADMIN_PASSWORD || 'admin123', 10),
      role: 'ADMIN',
      emailVerified: new Date(),
      isTestUser: true,
    },
  });

  // Create operator user
  const operatorUser = await prisma.user.create({
    data: {
      email: process.env.TEST_OPERATOR_EMAIL || 'operator@test.com',
      name: 'Test Operator',
      password: await bcrypt.hash(process.env.TEST_OPERATOR_PASSWORD || 'operator123', 10),
      role: 'OPERATOR',
      emailVerified: new Date(),
      isTestUser: true,
    },
  });

  logger.info('✅ Created test admin and operator users');

  // Create test customers with different scenarios
  for (const [index, scenario] of testScenarios.entries()) {
    // Create customer
    const customer = await prisma.customer.create({
      data: {
        name: scenario.name,
        accountStatus: scenario.accountStatus,
        paymentStatus: scenario.paymentStatus,
        overdueAmount: scenario.overdueAmount,
        totalOutstanding: scenario.totalOutstanding,
        paymentDueDate: scenario.paymentDueDate,
        lockReason: scenario.lockReason,
        lockedAt: scenario.lockedAt,
        lockedBy: scenario.lockedAt ? adminUser.id : null,
        isTestData: true,
        testScenario: scenario.name.toLowerCase().replace(/\s+/g, '_'),
      },
    });

    // Create customer user
    const customerUser = await prisma.user.create({
      data: {
        email: `customer${index + 1}@test.com`,
        name: `Test Customer ${index + 1}`,
        password: await bcrypt.hash('customer123', 10),
        role: 'CUSTOMER_ADMIN',
        customerId: customer.id,
        emailVerified: new Date(),
        isTestUser: true,
      },
    });

    // Create lock history if account is locked
    if (scenario.accountStatus === 'LOCKED' && scenario.lockedAt) {
      await prisma.accountLockHistory.create({
        data: {
          customerId: customer.id,
          action: 'LOCKED',
          reason: scenario.lockReason || 'Test lock',
          performedById: adminUser.id,
          timestamp: scenario.lockedAt,
          metadata: {
            test: true,
            scenario: scenario.name,
          },
        },
      });
    }

    // Create test skids
    const skidPromises = [];
    for (let i = 0; i < scenario.skidCount; i++) {
      skidPromises.push(
        prisma.skid.create({
          data: {
            skidCode: `TEST-${customer.id.slice(-4)}-${i + 1}`,
            trackingNumber: `TN${Date.now()}${i}`,
            customerId: customer.id,
            warehouseId: warehouses[i % warehouses.length].id,
            weight: Math.floor(Math.random() * 500) + 100,
            description: `Test Skid ${i + 1} for ${scenario.name}`,
            status: 'STORED',
            createdAt: subDays(new Date(), Math.floor(Math.random() * 30)),
          },
        })
      );
    }
    await Promise.all(skidPromises);

    logger.info(`✅ Created test customer: ${scenario.name}`);
  }

  // Create a regular test customer for general E2E tests
  const regularCustomer = await prisma.customer.create({
    data: {
      name: 'Regular Test Customer',
      accountStatus: 'ACTIVE',
      paymentStatus: 'CURRENT',
      overdueAmount: 0,
      totalOutstanding: 0,
      paymentDueDate: null,
      isTestData: true,
      testScenario: 'regular',
    },
  });

  await prisma.user.create({
    data: {
      email: process.env.TEST_CUSTOMER_EMAIL || 'customer@test.com',
      name: 'Test Customer',
      password: await bcrypt.hash(process.env.TEST_CUSTOMER_PASSWORD || 'customer123', 10),
      role: 'CUSTOMER_ADMIN',
      customerId: regularCustomer.id,
      emailVerified: new Date(),
      isTestUser: true,
    },
  });

  logger.info('✅ Created regular test customer');

  // Create some release requests for testing
  const pendingSkids = await prisma.skid.findMany({
    where: {
      customer: {
        paymentStatus: 'CURRENT',
      },
      status: 'STORED',
    },
    take: 2,
  });

  if (pendingSkids.length > 0) {
    await prisma.releaseRequest.create({
      data: {
        customerId: pendingSkids[0].customerId,
        status: 'PENDING',
        requestedById: (await prisma.user.findFirst({
          where: { customerId: pendingSkids[0].customerId },
        }))!.id,
        deliveryAddress: '789 Delivery St, Test City, TC 12345',
        skids: {
          connect: pendingSkids.map(s => ({ id: s.id })),
        },
      },
    });
    logger.info('✅ Created test release request');
  }

  logger.info('🎉 Test database seed completed!');
  logger.info('\n📋 Test Accounts:');
  logger.info('Admin: admin@test.com / admin123');
  logger.info('Operator: operator@test.com / operator123');
  logger.info('Customer: customer@test.com / customer123');
  logger.info('Customer 1 (Good Standing): customer1@test.com / customer123');
  logger.info('Customer 2 (Overdue 15 days): customer2@test.com / customer123');
  logger.info('Customer 3 (Delinquent 45 days): customer3@test.com / customer123');
  logger.info('Customer 4 (Locked): customer4@test.com / customer123');
  logger.info('Customer 5 (Suspended): customer5@test.com / customer123');
}

seed()
  .catch(e => {
    logger.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
