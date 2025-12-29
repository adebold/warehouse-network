import { PrismaClient, UserRole, WarehouseStatus, SkidStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting simple demo seed...');

  // Create platform
  let platform = await prisma.platform.findFirst({
    where: { name: 'Warehouse Network Ontario' },
  });

  if (!platform) {
    platform = await prisma.platform.create({
      data: {
        name: 'Warehouse Network Ontario',
      },
    });
  }

  // Create users with hashed passwords
  const hashedPassword = await bcrypt.hash('demo123', 10);

  // Super Admin
  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@warehouse-network.com' },
    update: {},
    create: {
      email: 'admin@warehouse-network.com',
      name: 'Admin User',
      password: hashedPassword,
      role: UserRole.SUPER_ADMIN,
    },
  });

  // Create a test customer
  let customer = await prisma.customer.findFirst({
    where: { name: 'Test Customer' },
  });

  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        name: 'Test Customer',
      },
    });
  }

  // Create customer user
  await prisma.user.upsert({
    where: { email: 'customer@test.com' },
    update: {},
    create: {
      email: 'customer@test.com',
      name: 'Test Customer User',
      password: hashedPassword,
      role: UserRole.CUSTOMER_ADMIN,
      customerId: customer.id,
    },
  });

  // Create an operator
  const operator = await prisma.operator.create({
    data: {
      legalName: 'Test Operator',
      platformId: platform.id,
      registrationDetails: `REG-${Date.now()}`,
      primaryContact: 'Test Contact',
      operatingRegions: 'Toronto',
      warehouseCount: 1,
      goodsCategories: 'General',
      insuranceAcknowledged: true,
      termsAccepted: true,
      termsAcceptedAt: new Date(),
      stripeAccountId: `acct_test`,
      stripeOnboardingComplete: true,
    },
  });

  // Create operator user
  await prisma.user.upsert({
    where: { email: 'operator@test.com' },
    update: {},
    create: {
      email: 'operator@test.com',
      name: 'Test Operator Admin',
      password: hashedPassword,
      role: UserRole.OPERATOR_ADMIN,
      operatorUser: {
        create: {
          operatorId: operator.id,
        },
      },
    },
  });

  // Create a warehouse
  const warehouse = await prisma.warehouse.create({
    data: {
      operatorId: operator.id,
      name: 'Test Warehouse',
      location: 'Toronto',
      address: '123 Test St',
      city: 'Toronto',
      province: 'ON',
      postalCode: 'M1M 1M1',
      latitude: 43.6532,
      longitude: -79.3832,
      totalSpace: 10000,
      operatingHours: '9-5',
      capacity: 100,
      supportedGoods: 'General',
      dockAccessInstructions: 'Use main entrance',
      status: WarehouseStatus.ACTIVE,
    },
  });

  // Create a test skid
  const skid = await prisma.skid.create({
    data: {
      warehouseId: warehouse.id,
      skidCode: 'TEST-001',
      customerId: customer.id,
      status: SkidStatus.STORED,
      footprint: 'standard',
    },
  });

  console.log('✅ Simple demo seed completed successfully!');
  console.log('\n📧 Demo Login Credentials:');
  console.log('  Admin: admin@warehouse-network.com / demo123');
  console.log('  Operator: operator@test.com / demo123');
  console.log('  Customer: customer@test.com / demo123');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async e => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
