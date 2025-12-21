import { faker } from '@faker-js/faker';
import {
  Customer,
  User,
  Warehouse,
  Skid,
  CustomerAccountStatus,
  CustomerPaymentStatus,
  UserRole,
} from '@prisma/client';
import bcrypt from 'bcryptjs';

// Factory for creating test customers
export const customerFactory = {
  build: (overrides: Partial<Customer> = {}): Omit<Customer, 'id' | 'createdAt' | 'updatedAt'> => ({
    name: faker.company.name(),
    accountStatus: 'ACTIVE' as CustomerAccountStatus,
    paymentStatus: 'CURRENT' as CustomerPaymentStatus,
    lockReason: null,
    lockedAt: null,
    lockedBy: null,
    paymentDueDate: null,
    overdueAmount: 0,
    totalOutstanding: 0,
    isTestData: true,
    testScenario: 'factory_generated',
    ...overrides,
  }),

  buildLocked: (overrides: Partial<Customer> = {}) =>
    customerFactory.build({
      accountStatus: 'LOCKED',
      paymentStatus: 'DELINQUENT',
      lockReason: 'Payment overdue 60+ days',
      lockedAt: new Date(),
      overdueAmount: faker.number.float({ min: 5000, max: 20000, precision: 0.01 }),
      totalOutstanding: faker.number.float({ min: 5000, max: 20000, precision: 0.01 }),
      paymentDueDate: faker.date.past({ days: 60 }),
      ...overrides,
    }),

  buildOverdue: (daysOverdue: number = 30, overrides: Partial<Customer> = {}) =>
    customerFactory.build({
      paymentStatus: daysOverdue > 45 ? 'DELINQUENT' : 'OVERDUE',
      overdueAmount: faker.number.float({ min: 1000, max: 10000, precision: 0.01 }),
      totalOutstanding: faker.number.float({ min: 1000, max: 15000, precision: 0.01 }),
      paymentDueDate: faker.date.past({ days: daysOverdue }),
      ...overrides,
    }),
};

// Factory for creating test users
export const userFactory = {
  build: async (
    overrides: Partial<User> = {}
  ): Promise<Omit<User, 'id' | 'createdAt' | 'updatedAt'>> => ({
    email: faker.internet.email(),
    emailVerified: new Date(),
    name: faker.person.fullName(),
    image: null,
    password: await bcrypt.hash('password123', 10),
    role: 'CUSTOMER_USER' as UserRole,
    customerId: null,
    isTestUser: true,
    ...overrides,
  }),

  buildAdmin: async (overrides: Partial<User> = {}) =>
    userFactory.build({
      role: 'ADMIN',
      email: `admin-${faker.string.alphanumeric(5)}@test.com`,
      name: 'Test Admin',
      ...overrides,
    }),

  buildOperator: async (overrides: Partial<User> = {}) =>
    userFactory.build({
      role: 'OPERATOR',
      email: `operator-${faker.string.alphanumeric(5)}@test.com`,
      name: 'Test Operator',
      ...overrides,
    }),

  buildCustomerAdmin: async (customerId: string, overrides: Partial<User> = {}) =>
    userFactory.build({
      role: 'CUSTOMER_ADMIN',
      customerId,
      email: `customer-${faker.string.alphanumeric(5)}@test.com`,
      ...overrides,
    }),
};

// Factory for creating test warehouses
export const warehouseFactory = {
  build: (
    operatorId: string,
    overrides: Partial<Warehouse> = {}
  ): Omit<Warehouse, 'id' | 'createdAt' | 'updatedAt'> => ({
    name: `${faker.company.name()} Warehouse`,
    location: faker.location.city(),
    address: faker.location.streetAddress(),
    city: faker.location.city(),
    province: faker.location.state({ abbreviated: true }),
    postalCode: faker.location.zipCode(),
    latitude: parseFloat(faker.location.latitude()),
    longitude: parseFloat(faker.location.longitude()),
    totalSpace: faker.number.int({ min: 10000, max: 100000 }),
    operatingHours: '8 AM - 6 PM',
    capacity: faker.number.int({ min: 100, max: 2000 }),
    supportedGoods: ['Electronics', 'General Merchandise', 'Dry Goods'],
    dockAccessInstructions: 'Check in at security',
    status: 'ACTIVE',
    operatorId,
    ...overrides,
  }),
};

// Factory for creating test skids
export const skidFactory = {
  build: (
    customerId: string,
    warehouseId: string,
    overrides: Partial<Skid> = {}
  ): Omit<Skid, 'id' | 'createdAt' | 'updatedAt'> => ({
    skidCode: `SKD-${faker.string.alphanumeric(8).toUpperCase()}`,
    trackingNumber: `TN${faker.string.numeric(12)}`,
    customerId,
    warehouseId,
    weight: faker.number.float({ min: 50, max: 1000, precision: 0.1 }),
    description: faker.commerce.productDescription(),
    status: 'STORED',
    location: `${faker.string.alpha({ length: 1, casing: 'upper' })}-${faker.string.numeric(2)}`,
    ...overrides,
  }),

  buildBatch: (count: number, customerId: string, warehouseId: string) => {
    return Array.from({ length: count }, () => skidFactory.build(customerId, warehouseId));
  },
};

// Helper to create a complete test scenario
export async function createTestScenario(
  prisma: any,
  scenario: {
    customerName: string;
    accountStatus?: CustomerAccountStatus;
    paymentStatus?: CustomerPaymentStatus;
    overdueAmount?: number;
    daysOverdue?: number;
    skidCount?: number;
    warehouseId: string;
    operatorId: string;
  }
) {
  const {
    customerName,
    accountStatus = 'ACTIVE',
    paymentStatus = 'CURRENT',
    overdueAmount = 0,
    daysOverdue = 0,
    skidCount = 5,
    warehouseId,
    operatorId,
  } = scenario;

  // Create customer
  const customerData = customerFactory.build({
    name: customerName,
    accountStatus,
    paymentStatus,
    overdueAmount,
    totalOutstanding: overdueAmount * 1.2,
    paymentDueDate: daysOverdue > 0 ? faker.date.past({ days: daysOverdue }) : null,
  });

  const customer = await prisma.customer.create({ data: customerData });

  // Create customer admin user
  const userData = await userFactory.buildCustomerAdmin(customer.id, {
    name: `${customerName} Admin`,
    email: `${customerName.toLowerCase().replace(/\s+/g, '-')}@test.com`,
  });

  const user = await prisma.user.create({ data: userData });

  // Create skids
  const skidsData = skidFactory.buildBatch(skidCount, customer.id, warehouseId);
  const skids = await Promise.all(skidsData.map(data => prisma.skid.create({ data })));

  return { customer, user, skids };
}

// Cleanup function for tests
export async function cleanupTestData(prisma: any) {
  // Delete in correct order to respect foreign key constraints
  await prisma.accountLockHistory.deleteMany({
    where: { customer: { isTestData: true } },
  });

  await prisma.releaseRequest.deleteMany({
    where: { customer: { isTestData: true } },
  });

  await prisma.skid.deleteMany({
    where: { customer: { isTestData: true } },
  });

  await prisma.user.deleteMany({
    where: { isTestUser: true },
  });

  await prisma.customer.deleteMany({
    where: { isTestData: true },
  });
}
