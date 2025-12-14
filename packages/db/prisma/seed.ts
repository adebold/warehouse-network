import { PrismaClient, UserRole } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

async function main() {
  console.log('Start seeding ...')

  // Create a default platform
  const platform = await prisma.platform.upsert({
    where: { name: 'Warehouse Network' },
    update: {},
    create: {
      name: 'Warehouse Network',
    },
  })
  console.log(`Created platform with id: ${platform.id}`)

  // Create Super Admin User
  const hashedPassword = await bcrypt.hash('password', 10)
  const superAdmin = await prisma.user.upsert({
    where: { email: 'superadmin@example.com' },
    update: {},
    create: {
      email: 'superadmin@example.com',
      name: 'Super Admin',
      password: hashedPassword,
      role: UserRole.SUPER_ADMIN,
    },
  })
  console.log(`Created super admin user with id: ${superAdmin.id}`)

  // Create Operator
  const operator = await prisma.operator.upsert({
    where: { legalName: 'Test Operator Inc.' },
    update: {},
    create: {
      legalName: 'Test Operator Inc.',
      platformId: platform.id,
      registrationDetails: 'Reg123',
      primaryContact: 'Op Admin',
      operatingRegions: 'North America',
      warehouseCount: 1,
      goodsCategories: 'General',
      insuranceAcknowledged: true,
      termsAccepted: true,
      termsAcceptedAt: new Date(),
    },
  })
  console.log(`Created operator with id: ${operator.id}`)

  // Create Operator Admin User
  const operatorAdmin = await prisma.user.upsert({
    where: { email: 'operatoradmin@example.com' },
    update: {},
    create: {
      email: 'operatoradmin@example.com',
      name: 'Operator Admin',
      password: hashedPassword,
      role: UserRole.OPERATOR_ADMIN,
      operatorUser: {
        create: {
          operatorId: operator.id,
        },
      },
    },
  })
  console.log(`Created operator admin user with id: ${operatorAdmin.id}`)

  // Create Warehouse Staff User
  const warehouseStaff = await prisma.user.upsert({
    where: { email: 'warehousestaff@example.com' },
    update: {},
    create: {
      email: 'warehousestaff@example.com',
      name: 'Warehouse Staff',
      password: hashedPassword,
      role: UserRole.WAREHOUSE_STAFF,
      operatorUser: {
        create: {
          operatorId: operator.id,
          // Assign to a specific warehouse later
        },
      },
    },
  })
  console.log(`Created warehouse staff user with id: ${warehouseStaff.id}`)

  // Create Customer
  const customer = await prisma.customer.upsert({
    where: { name: 'Test Customer Corp.' },
    update: {},
    create: {
      name: 'Test Customer Corp.',
    },
  })
  console.log(`Created customer with id: ${customer.id}`)

  // Create Customer Admin User
  const customerAdmin = await prisma.user.upsert({
    where: { email: 'customeradmin@example.com' },
    update: {},
    create: {
      email: 'customeradmin@example.com',
      name: 'Customer Admin',
      password: hashedPassword,
      role: UserRole.CUSTOMER_ADMIN,
      customerId: customer.id,
    },
  })
  console.log(`Created customer admin user with id: ${customerAdmin.id}`)

  // Create Customer User
  const customerUser = await prisma.user.upsert({
    where: { email: 'customeruser@example.com' },
    update: {},
    create: {
      email: 'customeruser@example.com',
      name: 'Customer User',
      password: hashedPassword,
      role: UserRole.CUSTOMER_USER,
      customerId: customer.id,
    },
  })
  console.log(`Created customer user with id: ${customerUser.id}`)

  console.log('Seeding finished.')
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
