import { PrismaClient, UserRole, WarehouseStatus, SkidStatus, PayoutStatus } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

// Sample warehouse images
const warehouseImages = [
  'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d',
  'https://images.unsplash.com/photo-1565891741441-64926e441838',
  'https://images.unsplash.com/photo-1553413077-190dd305871c',
  'https://images.unsplash.com/photo-1581087458702-372e94955c9f',
  'https://images.unsplash.com/photo-1567401893414-76b7b1e5a7a5',
  'https://images.unsplash.com/photo-1519452575417-564c1401ecc0'
]

// Sample Ontario cities
const cities = ['Toronto', 'Mississauga', 'Brampton', 'Hamilton', 'London', 'Kitchener', 'Windsor', 'Ottawa']

// Sample warehouse features
const features = [
  'Climate Control', 'High Ceilings (30ft+)', 'Loading Docks', 'Rail Access',
  '24/7 Security', 'LED Lighting', 'CCTV Monitoring', 'Sprinkler System',
  'Cross-Docking', 'Forklift Available', 'Pallet Racking', 'Office Space'
]

async function main() {
  console.log('🌱 Starting comprehensive demo seed...')

  // Create platform
  let platform = await prisma.platform.findFirst({
    where: { name: 'Warehouse Network Ontario' }
  })
  
  if (!platform) {
    platform = await prisma.platform.create({
      data: {
        name: 'Warehouse Network Ontario',
      },
    })
  }

  // Create users with hashed passwords
  const hashedPassword = await bcrypt.hash('demo123', 10)

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
  })

  // Create sample customers first
  const customerData = [
    { name: 'Maple Leaf E-commerce', email: 'ops@mapleleaf-ecom.com' },
    { name: 'Great Lakes Trading Co', email: 'admin@greatlakestrading.com' },
    { name: 'Toronto Tech Distributors', email: 'warehouse@torontotech.com' },
    { name: 'Ontario Manufacturing Inc', email: 'logistics@ontariomfg.com' },
  ]

  for (const custData of customerData) {
    let customer = await prisma.customer.findFirst({
      where: { name: custData.name }
    })
    
    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          name: custData.name,
        },
      })
    }

    await prisma.user.upsert({
      where: { email: custData.email },
      update: {},
      create: {
        email: custData.email,
        name: `${custData.name} Manager`,
        password: hashedPassword,
        role: UserRole.CUSTOMER_ADMIN,
        customerId: customer.id,
      },
    })
  }

  // Create multiple operators with warehouses
  const operatorData = [
    {
      name: 'Premium Storage Solutions',
      email: 'ops@premiumstorage.com',
      warehouses: 3,
      region: 'Toronto, Mississauga'
    },
    {
      name: 'Central Logistics Hub',
      email: 'manager@centrallogistics.com',
      warehouses: 2,
      region: 'Hamilton, Burlington'
    },
    {
      name: 'TechSpace Warehousing',
      email: 'admin@techspace.com',
      warehouses: 4,
      region: 'Kitchener, Waterloo, Cambridge'
    },
    {
      name: 'Express Distribution Centers',
      email: 'ops@expressdc.com',
      warehouses: 3,
      region: 'Brampton, Vaughan'
    }
  ]

  for (const opData of operatorData) {
    // Create operator
    const operator = await prisma.operator.create({
      data: {
        legalName: opData.name,
        platformId: platform.id,
        registrationDetails: `REG-${Date.now()}`,
        primaryContact: `${opData.name} Operations Team`,
        operatingRegions: opData.region,
        warehouseCount: opData.warehouses,
        goodsCategories: 'General Merchandise, E-commerce, Manufacturing',
        insuranceAcknowledged: true,
        termsAccepted: true,
        termsAcceptedAt: new Date(),
        stripeAccountId: `acct_${Math.random().toString(36).substr(2, 9)}`,
        stripeOnboardingComplete: true,
      },
    })

    // Create operator admin user
    const operatorAdmin = await prisma.user.upsert({
      where: { email: opData.email },
      update: {},
      create: {
        email: opData.email,
        name: `${opData.name} Admin`,
        password: hashedPassword,
        role: UserRole.OPERATOR_ADMIN,
        operatorUser: {
          create: {
            operatorId: operator.id,
          },
        },
      },
    })

    // Create warehouses for this operator
    for (let i = 0; i < opData.warehouses; i++) {
      const cityIndex = Math.floor(Math.random() * cities.length)
      const city = cities[cityIndex]
      const size = Math.floor(Math.random() * 100000) + 10000 // 10,000 to 110,000 sq ft
      
      const warehouse = await prisma.warehouse.create({
        data: {
          operatorId: operator.id,
          name: `${opData.name} - ${city} Facility ${i + 1}`,
          location: city,
          address: `${Math.floor(Math.random() * 9000) + 1000} Industrial Ave`,
          city: city,
          province: 'ON',
          postalCode: generatePostalCode(),
          latitude: 43.6532 + (Math.random() - 0.5) * 2, // Around Toronto
          longitude: -79.3832 + (Math.random() - 0.5) * 2,
          totalSpace: size,
          operatingHours: '24/7',
          capacity: Math.floor(size / 100), // Rough pallet capacity
          supportedGoods: 'General Merchandise, Palletized Goods, E-commerce Products',
          dockAccessInstructions: 'Please check in at security gate. Loading dock assignments provided on arrival.',
          status: WarehouseStatus.ACTIVE,
          pricingRules: {
            create: [
              {
                chargeCategory: 'STORAGE',
                price: 0.50, // $0.50 per pallet per day
                currency: 'CAD',
              },
              {
                chargeCategory: 'RECEIVING',
                price: 2.00, // $2.00 per pallet
                currency: 'CAD',
              },
              {
                chargeCategory: 'PICKING',
                price: 1.50, // $1.50 per pallet
                currency: 'CAD',
              },
              {
                chargeCategory: 'PICKUP_RELEASE',
                price: 1.00, // $1.00 per pallet
                currency: 'CAD',
              },
            ],
          },
        },
      })

      // Add some sample skids/inventory
      const skidCount = Math.floor(Math.random() * 50) + 10
      for (let j = 0; j < skidCount; j++) {
        // Create a customer for this skid
        const customerIndex = Math.floor(Math.random() * customerData.length)
        const customer = await prisma.customer.findFirst({
          where: { name: customerData[customerIndex].name }
        })
        
        if (customer) {
          await prisma.skid.create({
            data: {
              warehouseId: warehouse.id,
              skidCode: `SKU-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${j}`,
              customerId: customer.id,
              status: Math.random() > 0.1 ? SkidStatus.STORED : SkidStatus.READY,
              footprint: Math.random() > 0.8 ? 'oversized' : 'standard',
              specialHandlingNotes: Math.random() > 0.9 ? 'Fragile - Handle with care' : null,
            },
          })
        }
      }
    }

    // Create trust score for operator
    await prisma.operatorTrustScore.create({
      data: {
        operatorId: operator.id,
        score: Math.random() * 20 + 80, // 80-100
        operationalReliability: Math.random() * 20 + 80,
        capacityIntegrity: Math.random() * 20 + 80,
        financialBehavior: Math.random() * 20 + 80,
        complianceSignals: Math.random() * 20 + 80,
        lastCalculatedAt: new Date(),
      },
    })
  }


  // Create sample RFQs from customers
  const customers = await prisma.customer.findMany()
  const warehouses = await prisma.warehouse.findMany({ where: { status: 'ACTIVE' } })
  
  for (const customer of customers) {
    // Create 1-2 RFQs per customer
    const rfqCount = Math.floor(Math.random() * 2) + 1
    for (let i = 0; i < rfqCount; i++) {
      const isQuoted = Math.random() > 0.3
      const rfq = await prisma.rFQ.create({
        data: {
          customerId: customer.id,
          status: isQuoted ? 'QUOTED' : 'PENDING',
          estimatedSkidCount: Math.floor(Math.random() * 100) + 20,
          footprintType: Math.random() > 0.5 ? 'standard' : 'oversized',
          expectedInboundDate: new Date(Date.now() + Math.random() * 60 * 24 * 60 * 60 * 1000), // Random within next 60 days
          expectedDuration: ['3 months', '6 months', '1 year', 'unknown'][Math.floor(Math.random() * 4)],
          specialHandlingNotes: Math.random() > 0.7 ? 'Temperature controlled required' : null,
          preferredWarehouseIds: warehouses.length > 0 ? [warehouses[Math.floor(Math.random() * warehouses.length)].id] : [],
        },
      })

      // Create quotes for quoted RFQs
      if (isQuoted && warehouses.length > 0) {
        const warehouse = warehouses[Math.floor(Math.random() * warehouses.length)]
        const quote = await prisma.quote.create({
          data: {
            rfqId: rfq.id,
            warehouseId: warehouse.id,
            currency: 'CAD',
            assumptions: 'Standard handling procedures apply. 30-day payment terms.',
            guaranteedCharges: Math.random() > 0.5,
            depositAmount: 500,
            accrualStartRule: 'ON_RECEIPT',
            expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
            status: 'PENDING',
          },
        })

        // Create quote items
        const categories = ['RECEIVING', 'STORAGE', 'PICKING', 'PICKUP_RELEASE']
        for (const category of categories) {
          await prisma.quoteItem.create({
            data: {
              quoteId: quote.id,
              chargeCategory: category,
              unitPrice: Math.random() * 5 + 0.5,
              quantity: Math.floor(Math.random() * 100) + 10,
              description: `${category.toLowerCase().replace('_', ' ')} services`,
            },
          })
        }
      }
    }
  }

  // Create some sample payouts for operators
  const operators = await prisma.operator.findMany()
  for (const operator of operators) {
    // Create past payouts
    for (let i = 0; i < 3; i++) {
      await prisma.payout.create({
        data: {
          operatorId: operator.id,
          amount: Math.floor(Math.random() * 50000) + 10000,
          currency: 'CAD',
          status: PayoutStatus.COMPLETED,
          stripePayoutId: `po_${Math.random().toString(36).substr(2, 9)}`,
          processedAt: new Date(Date.now() - (i + 1) * 30 * 24 * 60 * 60 * 1000), // Monthly payouts
        },
      })
    }

    // Create pending payout
    await prisma.payout.create({
      data: {
        operatorId: operator.id,
        amount: Math.floor(Math.random() * 30000) + 5000,
        currency: 'CAD',
        status: PayoutStatus.PENDING,
      },
    })
  }


  console.log('✅ Demo seed completed successfully!')
  console.log('\n📧 Demo Login Credentials:')
  console.log('  Admin: admin@warehouse-network.com / demo123')
  console.log('  Operator: ops@premiumstorage.com / demo123')
  console.log('  Customer: ops@mapleleaf-ecom.com / demo123')
}

// Helper functions
function generatePostalCode(): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const numbers = '0123456789'
  return `${letters[Math.floor(Math.random() * letters.length)]}${numbers[Math.floor(Math.random() * numbers.length)]}${letters[Math.floor(Math.random() * letters.length)]} ${numbers[Math.floor(Math.random() * numbers.length)]}${letters[Math.floor(Math.random() * letters.length)]}${numbers[Math.floor(Math.random() * numbers.length)]}`
}

function getRandomProduct(): string {
  const products = [
    'Electronics - Consumer Goods',
    'Apparel - Mixed Clothing',
    'Food Products - Non-Perishable',
    'Home Goods - Furniture',
    'Auto Parts - Various',
    'Sporting Goods',
    'Books and Media',
    'Toys and Games',
    'Health and Beauty Products',
    'Industrial Equipment',
    'Building Materials',
    'Office Supplies',
  ]
  return products[Math.floor(Math.random() * products.length)]
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })