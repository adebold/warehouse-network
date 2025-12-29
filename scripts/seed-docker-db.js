#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

// Use Docker PostgreSQL connection
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://warehouse:warehouse123@localhost:5433/warehouse_network'
    }
  }
});

async function seedDatabase() {
  console.log('🌱 Seeding Docker PostgreSQL database...\n');

  try {
    // Clean existing data
    console.log('Cleaning existing data...');
    await prisma.$transaction([
      prisma.quoteItem.deleteMany(),
      prisma.quote.deleteMany(),
      prisma.rFQ.deleteMany(),
      prisma.lead.deleteMany(),
      prisma.cityPage.deleteMany(),
      prisma.pricingRule.deleteMany(),
      prisma.warehouseImage.deleteMany(),
      prisma.warehouseFeature.deleteMany(),
      prisma.warehouse.deleteMany(),
      prisma.operatorUser.deleteMany(),
      prisma.operator.deleteMany(),
      prisma.platform.deleteMany(),
      prisma.customer.deleteMany(),
      prisma.account.deleteMany(),
      prisma.session.deleteMany(),
      prisma.user.deleteMany()
    ]);
    console.log('✅ Cleaned existing data');

    // Create test users
    console.log('\nCreating test users...');
    const hashedPassword = await bcrypt.hash('password123', 10);
    
    const testUser = await prisma.user.create({
      data: {
        email: 'test@example.com',
        name: 'Test User',
        emailVerified: new Date(),
        accounts: {
          create: {
            type: 'credentials',
            provider: 'credentials',
            providerAccountId: 'test-user-1',
          }
        }
      }
    });

    const adminUser = await prisma.user.create({
      data: {
        email: 'admin@warehouse.com',
        name: 'Admin User',
        emailVerified: new Date(),
        accounts: {
          create: {
            type: 'credentials',
            provider: 'credentials',
            providerAccountId: 'admin-user-1',
          }
        }
      }
    });

    console.log('✅ Created test users');

    // Create platform first
    console.log('\nCreating platform...');
    const platform = await prisma.platform.create({
      data: {
        name: 'Warehouse Network'
      }
    });
    console.log('✅ Created platform');

    // Create test operators
    console.log('\nCreating test operators...');
    
    const operator1 = await prisma.operator.create({
      data: {
        legalName: 'Global Logistics Inc',
        platformId: platform.id,
        status: 'APPROVED',
        registrationDetails: JSON.stringify({
          name: 'Global Logistics Inc',
          email: 'contact@globallogistics.com',
          phone: '+1-555-0100',
          website: 'https://globallogistics.com',
          description: 'Leading warehouse operator with facilities across the country'
        }),
        primaryContact: 'contact@globallogistics.com',
        operatingRegions: 'Midwest, East Coast',
        warehouseCount: 15,
        goodsCategories: 'General Merchandise, Cold Storage, Hazmat',
        insuranceAcknowledged: true,
        termsAccepted: true,
        termsAcceptedAt: new Date(),
        users: {
          create: {
            userId: testUser.id
          }
        }
      }
    });

    const operator2 = await prisma.operator.create({
      data: {
        legalName: 'Metro Storage Solutions',
        platformId: platform.id,
        status: 'APPROVED',
        registrationDetails: JSON.stringify({
          name: 'Metro Storage Solutions',
          email: 'info@metrostorage.com',
          phone: '+1-555-0200',
          website: 'https://metrostorage.com',
          description: 'Premium storage and warehousing services'
        }),
        primaryContact: 'info@metrostorage.com',
        operatingRegions: 'West Coast, Southwest',
        warehouseCount: 8,
        goodsCategories: 'E-commerce, Retail, General Storage',
        insuranceAcknowledged: true,
        termsAccepted: true,
        termsAcceptedAt: new Date(),
        users: {
          create: {
            userId: adminUser.id
          }
        }
      }
    });

    console.log('✅ Created test operators');

    // Create test warehouses
    console.log('\nCreating test warehouses...');
    
    const warehouse1 = await prisma.warehouse.create({
      data: {
        name: 'Global Logistics - Chicago Hub',
        location: 'Chicago, IL',
        operatorId: operator1.id,
        address: '123 Industrial Blvd',
        city: 'Chicago',
        province: 'IL',
        postalCode: '60601',
        latitude: 41.8781,
        longitude: -87.6298,
        totalSpace: 150000,
        operatingHours: JSON.stringify({
          monday: { open: '06:00', close: '22:00' },
          tuesday: { open: '06:00', close: '22:00' },
          wednesday: { open: '06:00', close: '22:00' },
          thursday: { open: '06:00', close: '22:00' },
          friday: { open: '06:00', close: '22:00' },
          saturday: { open: '08:00', close: '18:00' },
          sunday: { closed: true }
        }),
        capacity: 150000,
        supportedGoods: 'General Merchandise, Cold Storage, Hazmat',
        dockAccessInstructions: 'Enter through main gate on Industrial Blvd. Check in at security. Dock assignments provided at check-in.',
        status: 'ACTIVE',
        features: {
          create: [
            { feature: '24/7 Security', category: 'SECURITY', value: 'true' },
            { feature: 'Climate Control', category: 'AMENITY', value: 'Available' },
            { feature: 'WMS Integration', category: 'TECHNOLOGY', value: 'SAP, Oracle' },
            { feature: 'Cross-Docking', category: 'OPERATIONS', value: 'true' }
          ]
        },
        images: {
          create: [
            { url: '/images/chicago-exterior.jpg', caption: 'Exterior view', type: 'EXTERIOR' },
            { url: '/images/chicago-interior.jpg', caption: 'Interior warehouse space', type: 'INTERIOR' }
          ]
        }
      }
    });

    const warehouse2 = await prisma.warehouse.create({
      data: {
        name: 'Metro Storage - Los Angeles Facility',
        location: 'Los Angeles, CA',
        operatorId: operator2.id,
        address: '456 Warehouse Way',
        city: 'Los Angeles',
        province: 'CA',
        postalCode: '90001',
        latitude: 34.0522,
        longitude: -118.2437,
        totalSpace: 200000,
        operatingHours: JSON.stringify({
          monday: { open: '07:00', close: '20:00' },
          tuesday: { open: '07:00', close: '20:00' },
          wednesday: { open: '07:00', close: '20:00' },
          thursday: { open: '07:00', close: '20:00' },
          friday: { open: '07:00', close: '20:00' },
          saturday: { open: '09:00', close: '17:00' },
          sunday: { closed: true }
        }),
        capacity: 200000,
        supportedGoods: 'E-commerce, Retail, General Storage',
        dockAccessInstructions: 'Use entrance on Warehouse Way. Present ID at gate. Proceed to dock assignment board.',
        status: 'ACTIVE',
        features: {
          create: [
            { feature: 'LED Lighting', category: 'AMENITY', value: 'true' },
            { feature: 'Electric Vehicle Charging', category: 'AMENITY', value: '10 stations' },
            { feature: 'Automated Gates', category: 'SECURITY', value: 'true' }
          ]
        },
        images: {
          create: [
            { url: '/images/la-exterior.jpg', caption: 'Main entrance', type: 'EXTERIOR' },
            { url: '/images/la-loading.jpg', caption: 'Loading dock area', type: 'DOCK' }
          ]
        }
      }
    });

    console.log('✅ Created test warehouses');

    // Create test customers and leads
    console.log('\nCreating test customers and leads...');
    
    const customer1 = await prisma.customer.create({
      data: {
        name: 'Acme Corporation',
        accountStatus: 'ACTIVE',
        paymentStatus: 'CURRENT'
      }
    });

    const lead1 = await prisma.lead.create({
      data: {
        email: 'john.doe@acmecorp.com',
        name: 'John Doe',
        company: 'Acme Corporation',
        phone: '+1-555-1001',
        source: 'Website',
        status: 'QUALIFIED',
        notes: 'Customer interested in Chicago facility for e-commerce fulfillment',
        customerId: customer1.id
      }
    });

    console.log('✅ Created test customers and leads');

    // Create test RFQ
    console.log('\nCreating test RFQs...');
    
    const rfq1 = await prisma.rFQ.create({
      data: {
        customerId: customer1.id,
        preferredWarehouseIds: [warehouse1.id, warehouse2.id],
        estimatedSkidCount: 500,
        footprintType: 'Standard Pallets',
        expectedInboundDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        expectedDuration: '12 months',
        specialHandlingNotes: 'Requires climate control for sensitive electronics',
        status: 'PENDING'
      }
    });
    
    console.log('✅ Created test RFQs');

    // Create test quotes
    console.log('\nCreating test quotes...');
    
    const quote1 = await prisma.quote.create({
      data: {
        rfqId: rfq1.id,
        warehouseId: warehouse1.id,
        currency: 'USD',
        depositAmount: 5000.00,
        accrualStartRule: 'ON_RECEIPT',
        expiryDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days from now
        status: 'PENDING',
        guaranteedCharges: true,
        assumptions: 'Based on standard pallet sizes and regular business hours',
        paymentMethod: 'INVOICE',
        paymentTerms: 'NET30',
        items: {
          create: [
            {
              chargeCategory: 'RECEIVING',
              unitPrice: 25.00,
              quantity: 500,
              description: 'Inbound receiving per skid'
            },
            {
              chargeCategory: 'STORAGE',
              unitPrice: 0.50,
              quantity: 500,
              description: 'Daily storage per skid'
            },
            {
              chargeCategory: 'PICKING',
              unitPrice: 15.00,
              quantity: 50,
              description: 'Estimated monthly picks'
            }
          ]
        }
      }
    });

    console.log('✅ Created test quotes');

    // Create pricing rules
    console.log('\nCreating pricing rules...');
    
    await prisma.pricingRule.createMany({
      data: [
        {
          warehouseId: warehouse1.id,
          chargeCategory: 'RECEIVING',
          price: 25.00,
          currency: 'USD'
        },
        {
          warehouseId: warehouse1.id,
          chargeCategory: 'STORAGE',
          price: 0.50,
          currency: 'USD'
        },
        {
          warehouseId: warehouse1.id,
          chargeCategory: 'PICKING',
          price: 15.00,
          currency: 'USD'
        },
        {
          warehouseId: warehouse1.id,
          chargeCategory: 'PICKUP_RELEASE',
          price: 35.00,
          currency: 'USD'
        },
        {
          warehouseId: warehouse2.id,
          chargeCategory: 'RECEIVING',
          price: 30.00,
          currency: 'USD'
        },
        {
          warehouseId: warehouse2.id,
          chargeCategory: 'STORAGE',
          price: 0.60,
          currency: 'USD'
        },
        {
          warehouseId: warehouse2.id,
          chargeCategory: 'PICKING',
          price: 18.00,
          currency: 'USD'
        },
        {
          warehouseId: warehouse2.id,
          chargeCategory: 'PICKUP_RELEASE',
          price: 40.00,
          currency: 'USD'
        }
      ]
    });

    console.log('✅ Created pricing rules');

    // Create city pages
    console.log('\nCreating city pages...');
    
    await prisma.cityPage.create({
      data: {
        city: 'Chicago',
        region: 'IL',
        slug: 'chicago-il',
        h1: 'Warehouse Space in Chicago, IL',
        introContent: 'Find the best warehouse space in Chicago. Our network includes state-of-the-art facilities with competitive pricing, excellent transportation access, and flexible lease terms. Compare locations and get instant quotes from verified operators.',
        isActive: true,
        authorId: adminUser.id
      }
    });

    await prisma.cityPage.create({
      data: {
        city: 'Los Angeles',
        region: 'CA',
        slug: 'los-angeles-ca',
        h1: 'Warehouse Space in Los Angeles, CA',
        introContent: 'Browse premium warehouse facilities in Los Angeles. Access modern storage solutions near major ports and highways. Get competitive rates and professional warehouse management services from trusted operators.',
        isActive: true,
        authorId: adminUser.id
      }
    });

    console.log('✅ Created city pages');

    // Summary
    const counts = {
      users: await prisma.user.count(),
      operators: await prisma.operator.count(),
      warehouses: await prisma.warehouse.count(),
      customers: await prisma.customer.count(),
      leads: await prisma.lead.count(),
      rfqs: await prisma.rFQ.count(),
      quotes: await prisma.quote.count(),
      quoteItems: await prisma.quoteItem.count(),
      pricingRules: await prisma.pricingRule.count(),
      cityPages: await prisma.cityPage.count(),
      warehouseFeatures: await prisma.warehouseFeature.count(),
      warehouseImages: await prisma.warehouseImage.count()
    };

    console.log('\n✨ Seeding completed successfully!');
    console.log('\n📊 Database Summary:');
    Object.entries(counts).forEach(([table, count]) => {
      console.log(`- ${table}: ${count}`);
    });

    console.log('\n🔐 Test Credentials:');
    console.log('- Email: test@example.com');
    console.log('- Email: admin@warehouse.com');
    console.log('- Password: password123');

  } catch (error) {
    console.error('❌ Error seeding database:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run seeding
seedDatabase().catch((error) => {
  console.error(error);
  process.exit(1);
});