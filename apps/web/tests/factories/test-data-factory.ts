import { faker } from '@faker-js/faker';
import type { User, Operator, Warehouse, Customer, Booking } from '@prisma/client';

export class TestDataFactory {
  // User factory
  static createUser(overrides?: Partial<User>): User {
    return {
      id: faker.string.uuid(),
      email: faker.internet.email(),
      name: faker.person.fullName(),
      password: '$2b$10$K7L1OJ0TBBLe5K7bVouLmuNYB4YcA/HiUIHGJ6EzsR0SUx.sFqHxa', // password123
      role: 'CUSTOMER_USER',
      createdAt: faker.date.past(),
      updatedAt: faker.date.recent(),
      customerId: null,
      ...overrides,
    };
  }

  // Operator factory
  static createOperator(overrides?: Partial<Operator>): Operator {
    return {
      id: faker.string.uuid(),
      legalName: faker.company.name() + ' Logistics Inc.',
      platformId: faker.string.uuid(),
      registrationDetails: `REG${faker.number.int({ min: 100000, max: 999999 })}`,
      primaryContact: faker.person.fullName(),
      operatingRegions: faker.helpers
        .arrayElements(['Ontario', 'Quebec', 'Alberta', 'British Columbia'])
        .join(','),
      warehouseCount: faker.number.int({ min: 1, max: 10 }),
      goodsCategories: faker.helpers
        .arrayElements(['General', 'Electronics', 'Food', 'Chemical', 'Pharmaceutical'])
        .join(','),
      insuranceAcknowledged: true,
      termsAccepted: true,
      termsAcceptedAt: faker.date.past(),
      createdAt: faker.date.past(),
      updatedAt: faker.date.recent(),
      ...overrides,
    };
  }

  // Warehouse factory
  static createWarehouse(overrides?: Partial<any>): any {
    const features = faker.helpers.arrayElements(
      [
        '24/7 Access',
        'Climate Control',
        'Security System',
        'Loading Docks',
        'Office Space',
        'CCTV',
        'Forklift Available',
        'Parking',
        'WiFi',
        'Sprinkler System',
      ],
      faker.number.int({ min: 3, max: 7 })
    );

    return {
      id: faker.string.uuid(),
      name: faker.company.name() + ' Warehouse',
      operatorId: faker.string.uuid(),
      address: faker.location.streetAddress(),
      city: faker.helpers.arrayElement([
        'Toronto',
        'Mississauga',
        'Brampton',
        'Hamilton',
        'Ottawa',
      ]),
      province: 'ON',
      postalCode: faker.location.zipCode('L#? #?#'),
      country: 'Canada',
      totalSize: faker.number.int({ min: 5000, max: 100000 }),
      availableSize: faker.number.int({ min: 1000, max: 50000 }),
      ceilingHeight: faker.number.int({ min: 20, max: 40 }),
      loadingDocks: faker.number.int({ min: 1, max: 10 }),
      features: features,
      description: faker.lorem.paragraphs(2),
      basePrice: parseFloat(faker.finance.amount(8, 25, 2)),
      pricingModel: faker.helpers.arrayElement([
        'per-sqft-monthly',
        'flat-monthly',
        'per-pallet-daily',
      ]),
      images: Array(faker.number.int({ min: 3, max: 8 }))
        .fill(null)
        .map(() => faker.image.url()),
      isActive: true,
      createdAt: faker.date.past(),
      updatedAt: faker.date.recent(),
      ...overrides,
    };
  }

  // Customer factory
  static createCustomer(overrides?: Partial<Customer>): Customer {
    return {
      id: faker.string.uuid(),
      name: faker.company.name(),
      createdAt: faker.date.past(),
      updatedAt: faker.date.recent(),
      ...overrides,
    };
  }

  // Booking factory
  static createBooking(overrides?: Partial<any>): any {
    const startDate = faker.date.future();
    const endDate = faker.date.future({ refDate: startDate });

    return {
      id: faker.string.uuid(),
      customerId: faker.string.uuid(),
      warehouseId: faker.string.uuid(),
      startDate: startDate,
      endDate: endDate,
      size: faker.number.int({ min: 1000, max: 20000 }),
      totalPrice: parseFloat(faker.finance.amount(1000, 50000, 2)),
      status: faker.helpers.arrayElement([
        'PENDING',
        'CONFIRMED',
        'ACTIVE',
        'COMPLETED',
        'CANCELLED',
      ]),
      requirements: faker.lorem.sentences(2),
      goodsCategory: faker.helpers.arrayElement([
        'General Merchandise',
        'Electronics',
        'Food Products',
        'Raw Materials',
      ]),
      insuranceConfirmed: true,
      paymentMethod: faker.helpers.arrayElement(['credit_card', 'bank_transfer', 'invoice']),
      paymentStatus: faker.helpers.arrayElement(['pending', 'paid', 'partial', 'refunded']),
      checkInDate: null,
      checkOutDate: null,
      notes: faker.lorem.sentence(),
      createdAt: faker.date.past(),
      updatedAt: faker.date.recent(),
      ...overrides,
    };
  }

  // Generate test scenarios
  static generateScenarios() {
    return {
      // Happy path scenario
      happyPath: {
        operator: this.createOperator({
          legalName: 'Premium Logistics Solutions Inc.',
          warehouseCount: 5,
        }),
        warehouses: [
          this.createWarehouse({
            name: 'Toronto Premium Distribution Center',
            city: 'Toronto',
            totalSize: 50000,
            availableSize: 25000,
            features: [
              '24/7 Access',
              'Climate Control',
              'Security System',
              'Loading Docks',
              'Office Space',
            ],
            basePrice: 18.5,
          }),
          this.createWarehouse({
            name: 'Mississauga Budget Storage',
            city: 'Mississauga',
            totalSize: 15000,
            availableSize: 10000,
            features: ['Loading Docks', 'Parking'],
            basePrice: 8.0,
          }),
        ],
        customer: this.createCustomer({ name: 'TechStart Inc.' }),
        users: {
          operatorAdmin: this.createUser({
            email: 'admin@premiumlogistics.com',
            name: 'Jane Smith',
            role: 'OPERATOR_ADMIN',
          }),
          customerAdmin: this.createUser({
            email: 'procurement@techstart.com',
            name: 'John Davis',
            role: 'CUSTOMER_ADMIN',
          }),
          customerUser: this.createUser({
            email: 'logistics@techstart.com',
            name: 'Sarah Johnson',
            role: 'CUSTOMER_USER',
          }),
        },
        bookings: [
          this.createBooking({
            size: 5000,
            totalPrice: 4625.0,
            status: 'ACTIVE',
            goodsCategory: 'Electronics',
          }),
        ],
      },

      // Edge cases
      edgeCases: {
        // Warehouse at capacity
        fullWarehouse: this.createWarehouse({
          name: 'Fully Booked Warehouse',
          totalSize: 20000,
          availableSize: 0,
          isActive: true,
        }),

        // Last-minute booking
        urgentBooking: this.createBooking({
          startDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
          requirements: 'URGENT: Need space immediately for emergency inventory',
          status: 'PENDING',
        }),

        // Large enterprise customer
        enterpriseCustomer: this.createCustomer({
          name: 'Fortune 500 Corp',
        }),

        // Multi-location operator
        multiLocationOperator: this.createOperator({
          legalName: 'National Warehouse Network Ltd.',
          operatingRegions: 'Ontario,Quebec,Alberta,British Columbia',
          warehouseCount: 25,
        }),
      },

      // Error scenarios
      errorScenarios: {
        // Invalid booking dates
        invalidDates: {
          startDate: new Date('2025-06-01'),
          endDate: new Date('2025-05-01'), // End before start
        },

        // Insufficient space
        oversizedBooking: {
          requestedSize: 100000,
          availableSize: 5000,
        },

        // Payment failure
        failedPayment: this.createBooking({
          paymentStatus: 'failed',
          status: 'CANCELLED',
          notes: 'Payment declined - insufficient funds',
        }),
      },

      // Performance test data
      performanceData: {
        // Generate many warehouses for search performance testing
        manyWarehouses: Array(1000)
          .fill(null)
          .map(() => this.createWarehouse()),

        // Generate concurrent bookings
        concurrentBookings: Array(50)
          .fill(null)
          .map(() =>
            this.createBooking({
              status: 'PENDING',
              startDate: faker.date.between({
                from: new Date(),
                to: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
              }),
            })
          ),
      },
    };
  }

  // Generate test users with specific personas
  static generateTestUsers() {
    return {
      superAdmin: {
        email: 'test.super@warehouse.network',
        password: 'SuperSecure123!',
        name: 'Test Super Admin',
        role: 'SUPER_ADMIN',
      },
      operatorAdmin: {
        email: 'test.operator@warehouse.network',
        password: 'OperatorPass123!',
        name: 'Test Operator Admin',
        role: 'OPERATOR_ADMIN',
      },
      warehouseStaff: {
        email: 'test.staff@warehouse.network',
        password: 'StaffPass123!',
        name: 'Test Warehouse Staff',
        role: 'WAREHOUSE_STAFF',
      },
      customerAdmin: {
        email: 'test.customer.admin@warehouse.network',
        password: 'CustomerAdmin123!',
        name: 'Test Customer Admin',
        role: 'CUSTOMER_ADMIN',
      },
      customerUser: {
        email: 'test.customer@warehouse.network',
        password: 'CustomerUser123!',
        name: 'Test Customer User',
        role: 'CUSTOMER_USER',
      },
    };
  }
}
