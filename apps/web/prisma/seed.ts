import { PrismaClient, OrgType, UserStatus } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Starting database seed...')

  // Create Platform Organization (Super Admin)
  const platformOrg = await prisma.organization.upsert({
    where: { slug: 'platform' },
    update: {},
    create: {
      name: 'Skidspace Platform',
      slug: 'platform',
      type: OrgType.PLATFORM,
      contactEmail: 'admin@skidspace.com',
      subscriptionTier: 'ENTERPRISE',
      settings: {
        features: ['all'],
        limits: {
          users: -1, // unlimited
          warehouses: -1,
          apiCalls: -1
        }
      }
    }
  })

  console.log('✅ Created platform organization')

  // Create System Roles for Platform
  const superAdminRole = await prisma.role.upsert({
    where: {
      slug_organizationId: {
        slug: 'super-admin',
        organizationId: platformOrg.id
      }
    },
    update: {},
    create: {
      name: 'Super Administrator',
      slug: 'super-admin',
      description: 'Full platform administration access',
      organizationId: platformOrg.id,
      level: 100,
      isSystem: true,
      color: '#EF4444',
      icon: 'Shield'
    }
  })

  const platformAdminRole = await prisma.role.upsert({
    where: {
      slug_organizationId: {
        slug: 'platform-admin',
        organizationId: platformOrg.id
      }
    },
    update: {},
    create: {
      name: 'Platform Administrator',
      slug: 'platform-admin',
      description: 'Platform management and support',
      organizationId: platformOrg.id,
      level: 90,
      isSystem: true,
      color: '#F59E0B',
      icon: 'Settings'
    }
  })

  console.log('✅ Created platform roles')

  // Create System Permissions for Platform
  const platformPermissions = [
    // Organization Management
    { name: 'View All Organizations', slug: 'org:read:all', category: 'organization', description: 'View all organizations across the platform' },
    { name: 'Create Organizations', slug: 'org:create', category: 'organization', description: 'Create new organizations' },
    { name: 'Update Organizations', slug: 'org:update:all', category: 'organization', description: 'Update any organization' },
    { name: 'Delete Organizations', slug: 'org:delete:all', category: 'organization', description: 'Delete any organization' },
    { name: 'Manage Organization Settings', slug: 'org:settings:all', category: 'organization', description: 'Manage settings for any organization' },

    // User Management
    { name: 'View All Users', slug: 'user:read:all', category: 'user', description: 'View all users across the platform' },
    { name: 'Create Users', slug: 'user:create:all', category: 'user', description: 'Create users in any organization' },
    { name: 'Update Users', slug: 'user:update:all', category: 'user', description: 'Update any user' },
    { name: 'Delete Users', slug: 'user:delete:all', category: 'user', description: 'Delete any user' },
    { name: 'Impersonate Users', slug: 'user:impersonate', category: 'user', description: 'Sign in as any user for support' },

    // Role & Permission Management
    { name: 'View All Roles', slug: 'role:read:all', category: 'rbac', description: 'View roles across all organizations' },
    { name: 'Create Roles', slug: 'role:create:all', category: 'rbac', description: 'Create roles in any organization' },
    { name: 'Update Roles', slug: 'role:update:all', category: 'rbac', description: 'Update any role' },
    { name: 'Delete Roles', slug: 'role:delete:all', category: 'rbac', description: 'Delete any role' },
    { name: 'Assign Roles', slug: 'role:assign:all', category: 'rbac', description: 'Assign any role to any user' },

    // System Management
    { name: 'View System Config', slug: 'system:config:read', category: 'system', description: 'View system configuration' },
    { name: 'Update System Config', slug: 'system:config:update', category: 'system', description: 'Update system configuration' },
    { name: 'View Audit Logs', slug: 'system:audit:read', category: 'system', description: 'View all audit logs' },
    { name: 'Manage API Keys', slug: 'system:apikeys:all', category: 'system', description: 'Manage API keys across all organizations' },

    // Warehouse Management
    { name: 'View All Warehouses', slug: 'warehouse:read:all', category: 'warehouse', description: 'View all warehouses across all organizations' },
    { name: 'Create Warehouses', slug: 'warehouse:create:all', category: 'warehouse', description: 'Create warehouses in any organization' },
    { name: 'Update Warehouses', slug: 'warehouse:update:all', category: 'warehouse', description: 'Update any warehouse' },
    { name: 'Delete Warehouses', slug: 'warehouse:delete:all', category: 'warehouse', description: 'Delete any warehouse' },

    // Analytics & Reporting
    { name: 'View Platform Analytics', slug: 'analytics:platform', category: 'analytics', description: 'View platform-wide analytics and reports' },
    { name: 'Export Platform Data', slug: 'analytics:export:all', category: 'analytics', description: 'Export data from any organization' },
  ]

  for (const permission of platformPermissions) {
    await prisma.permission.upsert({
      where: {
        slug_organizationId: {
          slug: permission.slug,
          organizationId: platformOrg.id
        }
      },
      update: {},
      create: {
        ...permission,
        organizationId: platformOrg.id,
        isSystem: true
      }
    })
  }

  console.log('✅ Created platform permissions')

  // Assign all permissions to Super Admin role
  const allPlatformPermissions = await prisma.permission.findMany({
    where: { organizationId: platformOrg.id }
  })

  for (const permission of allPlatformPermissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: superAdminRole.id,
          permissionId: permission.id
        }
      },
      update: {},
      create: {
        roleId: superAdminRole.id,
        permissionId: permission.id
      }
    })
  }

  console.log('✅ Assigned permissions to Super Admin role')

  // Create Default Super Admin User
  const hashedPassword = await bcrypt.hash('SuperAdmin123!', 10)

  const superAdminUser = await prisma.user.upsert({
    where: { email: 'superadmin@skidspace.com' },
    update: {},
    create: {
      email: 'superadmin@skidspace.com',
      emailVerified: new Date(),
      name: 'Super Administrator',
      password: hashedPassword,
      status: UserStatus.ACTIVE,
      organizationId: platformOrg.id,
      metadata: {
        isSystemUser: true,
        createdBy: 'seed'
      }
    }
  })

  // Assign Super Admin role to the user
  await prisma.userRole.upsert({
    where: {
      userId_roleId_resourceType_resourceId: {
        userId: superAdminUser.id,
        roleId: superAdminRole.id,
        resourceType: null,
        resourceId: null
      }
    },
    update: {},
    create: {
      userId: superAdminUser.id,
      roleId: superAdminRole.id
    }
  })

  console.log('✅ Created Super Admin user')

  // Create Standard Organization Roles (Templates)
  const standardRoles = [
    // Warehouse Organization Roles
    {
      name: 'Warehouse Owner',
      slug: 'warehouse-owner',
      description: 'Full ownership and management of warehouse operations',
      level: 80,
      color: '#10B981',
      icon: 'Crown'
    },
    {
      name: 'Warehouse Manager',
      slug: 'warehouse-manager',
      description: 'Management of warehouse operations and staff',
      level: 70,
      color: '#3B82F6',
      icon: 'UserCheck'
    },
    {
      name: 'Warehouse Operator',
      slug: 'warehouse-operator',
      description: 'Day-to-day warehouse operations',
      level: 50,
      color: '#8B5CF6',
      icon: 'Package'
    },
    {
      name: 'Warehouse Viewer',
      slug: 'warehouse-viewer',
      description: 'Read-only access to warehouse information',
      level: 30,
      color: '#6B7280',
      icon: 'Eye'
    },

    // E-bike Business Roles
    {
      name: 'Business Owner',
      slug: 'business-owner',
      description: 'Full ownership and management of e-bike business',
      level: 80,
      color: '#10B981',
      icon: 'Crown'
    },
    {
      name: 'Business Manager',
      slug: 'business-manager',
      description: 'Management of business operations',
      level: 70,
      color: '#3B82F6',
      icon: 'Briefcase'
    },
    {
      name: 'Fleet Coordinator',
      slug: 'fleet-coordinator',
      description: 'Management of e-bike fleet and logistics',
      level: 60,
      color: '#F59E0B',
      icon: 'Truck'
    },
    {
      name: 'Customer Service',
      slug: 'customer-service',
      description: 'Customer support and service',
      level: 40,
      color: '#EF4444',
      icon: 'Headphones'
    },

    // Customer Organization Roles
    {
      name: 'Account Owner',
      slug: 'account-owner',
      description: 'Primary account holder with full access',
      level: 80,
      color: '#10B981',
      icon: 'User'
    },
    {
      name: 'Account Member',
      slug: 'account-member',
      description: 'Standard account access',
      level: 50,
      color: '#6B7280',
      icon: 'Users'
    }
  ]

  for (const role of standardRoles) {
    await prisma.role.upsert({
      where: {
        slug_organizationId: {
          slug: role.slug,
          organizationId: null // These are templates
        }
      },
      update: {},
      create: {
        ...role,
        organizationId: null, // Templates can be copied to organizations
        isSystem: true
      }
    })
  }

  console.log('✅ Created standard role templates')

  // Create Standard Permissions (Templates)
  const standardPermissions = [
    // Organization permissions
    { name: 'View Organization', slug: 'org:read', category: 'organization' },
    { name: 'Update Organization', slug: 'org:update', category: 'organization' },
    { name: 'Manage Organization Settings', slug: 'org:settings', category: 'organization' },
    { name: 'View Organization Members', slug: 'org:members:read', category: 'organization' },
    { name: 'Invite Members', slug: 'org:members:invite', category: 'organization' },
    { name: 'Remove Members', slug: 'org:members:remove', category: 'organization' },

    // User permissions
    { name: 'View Profile', slug: 'user:profile:read', category: 'user' },
    { name: 'Update Profile', slug: 'user:profile:update', category: 'user' },
    { name: 'Change Password', slug: 'user:password:update', category: 'user' },

    // Warehouse permissions
    { name: 'View Warehouse', slug: 'warehouse:read', category: 'warehouse' },
    { name: 'Update Warehouse', slug: 'warehouse:update', category: 'warehouse' },
    { name: 'Manage Warehouse Settings', slug: 'warehouse:settings', category: 'warehouse' },
    { name: 'View Inventory', slug: 'warehouse:inventory:read', category: 'warehouse' },
    { name: 'Manage Inventory', slug: 'warehouse:inventory:update', category: 'warehouse' },
    { name: 'View Orders', slug: 'warehouse:orders:read', category: 'warehouse' },
    { name: 'Process Orders', slug: 'warehouse:orders:process', category: 'warehouse' },

    // Analytics permissions
    { name: 'View Basic Analytics', slug: 'analytics:basic', category: 'analytics' },
    { name: 'View Advanced Analytics', slug: 'analytics:advanced', category: 'analytics' },
    { name: 'Export Data', slug: 'analytics:export', category: 'analytics' },

    // API permissions
    { name: 'Access API', slug: 'api:access', category: 'api' },
    { name: 'Manage API Keys', slug: 'api:keys', category: 'api' },
  ]

  for (const permission of standardPermissions) {
    await prisma.permission.upsert({
      where: {
        slug_organizationId: {
          slug: permission.slug,
          organizationId: null
        }
      },
      update: {},
      create: {
        ...permission,
        organizationId: null, // Templates
        isSystem: true
      }
    })
  }

  console.log('✅ Created standard permission templates')

  // Create System Configuration
  const systemConfigs = [
    {
      key: 'app.name',
      value: 'Skidspace',
      description: 'Application name',
      category: 'general'
    },
    {
      key: 'app.version',
      value: '1.0.0',
      description: 'Application version',
      category: 'general'
    },
    {
      key: 'auth.session.maxAge',
      value: 2592000, // 30 days
      description: 'Maximum session age in seconds',
      category: 'authentication'
    },
    {
      key: 'auth.password.minLength',
      value: 8,
      description: 'Minimum password length',
      category: 'authentication'
    },
    {
      key: 'auth.invitation.expiryDays',
      value: 7,
      description: 'Invitation expiry in days',
      category: 'authentication'
    },
    {
      key: 'org.subscription.defaultTier',
      value: 'FREE',
      description: 'Default subscription tier for new organizations',
      category: 'billing'
    },
    {
      key: 'feature.flags',
      value: {
        multiTenant: true,
        apiAccess: true,
        advancedAnalytics: true,
        customBranding: false
      },
      description: 'Feature flags configuration',
      category: 'features'
    }
  ]

  for (const config of systemConfigs) {
    await prisma.systemConfig.upsert({
      where: { key: config.key },
      update: {},
      create: config
    })
  }

  console.log('✅ Created system configuration')

  // Create Demo Warehouse Organization
  const demoWarehouse = await prisma.organization.upsert({
    where: { slug: 'demo-warehouse' },
    update: {},
    create: {
      name: 'Demo Warehouse Co.',
      slug: 'demo-warehouse',
      domain: 'demo-warehouse',
      type: OrgType.WAREHOUSE,
      contactEmail: 'contact@demo-warehouse.com',
      contactPhone: '+1-555-0123',
      address: {
        street: '123 Warehouse Ave',
        city: 'Industrial City',
        state: 'CA',
        postalCode: '90210',
        country: 'US'
      },
      subscriptionTier: 'BUSINESS',
      settings: {
        features: ['inventory', 'orders', 'analytics'],
        limits: {
          users: 50,
          warehouses: 5,
          apiCalls: 10000
        }
      }
    }
  })

  console.log('✅ Created demo warehouse organization')

  console.log('🎉 Database seed completed successfully!')
  console.log('📧 Super Admin Email: superadmin@skidspace.com')
  console.log('🔑 Super Admin Password: SuperAdmin123!')
  console.log('🏢 Platform Organization: platform')
  console.log('🏭 Demo Warehouse: demo-warehouse')
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