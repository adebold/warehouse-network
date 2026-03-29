#!/usr/bin/env node

/**
 * Production Database Initialization Script
 *
 * This script initializes the production database with the platform organization,
 * super admin user, roles, permissions, and essential system data.
 *
 * Features:
 * - Creates platform organization
 * - Sets up role hierarchy and permissions
 * - Creates super admin user with full privileges
 * - Initializes system configuration
 * - Sets up audit logging
 * - Configures default settings
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

class ProductionDatabaseInitializer {
  constructor() {
    this.prisma = new PrismaClient();
    this.credentials = null;
    this.platformOrg = null;
    this.superAdminUser = null;
  }

  /**
   * Load credentials from file
   * @param {string} credentialFile - Path to credential file
   */
  loadCredentials(credentialFile) {
    if (!fs.existsSync(credentialFile)) {
      throw new Error(`Credential file not found: ${credentialFile}`);
    }

    const data = JSON.parse(fs.readFileSync(credentialFile, 'utf8'));
    this.credentials = data.credentials;
    console.log('✅ Credentials loaded successfully');
  }

  /**
   * Initialize the database connection and verify access
   */
  async initializeConnection() {
    try {
      await this.prisma.$connect();
      console.log('✅ Database connection established');

      // Test database access
      const result = await this.prisma.$queryRaw`SELECT version()`;
      console.log('✅ Database access verified');
    } catch (error) {
      console.error('❌ Database connection failed:', error.message);
      throw error;
    }
  }

  /**
   * Create the platform organization
   */
  async createPlatformOrganization() {
    console.log('🏢 Creating platform organization...');

    try {
      // Check if platform organization already exists
      this.platformOrg = await this.prisma.organization.findFirst({
        where: { type: 'PLATFORM' }
      });

      if (this.platformOrg) {
        console.log('✅ Platform organization already exists');
        return this.platformOrg;
      }

      // Create new platform organization
      this.platformOrg = await this.prisma.organization.create({
        data: {
          name: 'Skidspace Platform',
          slug: 'platform',
          type: 'PLATFORM',
          contactEmail: this.credentials.superAdmin.email,
          subscriptionTier: 'ENTERPRISE',
          settings: {
            features: ['all'],
            limits: {
              users: -1, // unlimited
              warehouses: -1,
              apiCalls: -1,
              storage: -1
            },
            security: {
              enforceSSO: false,
              requireMFA: true,
              passwordPolicy: 'strict',
              sessionTimeout: 8 // hours
            },
            branding: {
              logo: null,
              primaryColor: '#2563EB',
              accentColor: '#EF4444'
            }
          },
          metadata: {
            createdBy: 'system-init',
            environment: 'production',
            version: '1.0.0'
          }
        }
      });

      console.log(`✅ Platform organization created: ${this.platformOrg.id}`);
      return this.platformOrg;

    } catch (error) {
      console.error('❌ Failed to create platform organization:', error.message);
      throw error;
    }
  }

  /**
   * Create system permissions
   */
  async createSystemPermissions() {
    console.log('🔐 Creating system permissions...');

    const permissions = [
      // Platform Administration
      {
        name: 'Platform Administration',
        slug: 'platform.admin',
        description: 'Full platform administration access',
        category: 'platform',
        isSystem: true
      },
      {
        name: 'User Management',
        slug: 'platform.users.manage',
        description: 'Create, update, and delete users',
        category: 'platform',
        isSystem: true
      },
      {
        name: 'Organization Management',
        slug: 'platform.orgs.manage',
        description: 'Create, update, and delete organizations',
        category: 'platform',
        isSystem: true
      },
      {
        name: 'System Configuration',
        slug: 'platform.config.manage',
        description: 'Manage system configuration and settings',
        category: 'platform',
        isSystem: true
      },
      {
        name: 'Audit Logs',
        slug: 'platform.audit.view',
        description: 'View audit logs and system activity',
        category: 'platform',
        isSystem: true
      },

      // Organization Administration
      {
        name: 'Organization Admin',
        slug: 'org.admin',
        description: 'Organization administration',
        category: 'organization',
        isSystem: false
      },
      {
        name: 'Warehouse Management',
        slug: 'warehouse.manage',
        description: 'Create and manage warehouses',
        category: 'warehouse',
        isSystem: false
      },
      {
        name: 'Inventory Management',
        slug: 'inventory.manage',
        description: 'Manage inventory items and stock',
        category: 'inventory',
        isSystem: false
      },
      {
        name: 'User Invitation',
        slug: 'users.invite',
        description: 'Invite users to organization',
        category: 'user',
        isSystem: false
      },

      // Standard User Permissions
      {
        name: 'Warehouse Access',
        slug: 'warehouse.view',
        description: 'View warehouse information',
        category: 'warehouse',
        isSystem: false
      },
      {
        name: 'Inventory View',
        slug: 'inventory.view',
        description: 'View inventory information',
        category: 'inventory',
        isSystem: false
      },
      {
        name: 'Profile Management',
        slug: 'profile.manage',
        description: 'Manage own profile and settings',
        category: 'user',
        isSystem: false
      }
    ];

    const createdPermissions = [];

    for (const permission of permissions) {
      try {
        const existing = await this.prisma.permission.findFirst({
          where: {
            slug: permission.slug,
            organizationId: this.platformOrg.id
          }
        });

        if (!existing) {
          const created = await this.prisma.permission.create({
            data: {
              ...permission,
              organizationId: this.platformOrg.id
            }
          });
          createdPermissions.push(created);
          console.log(`  ✅ Created permission: ${permission.slug}`);
        } else {
          createdPermissions.push(existing);
          console.log(`  ↻ Permission exists: ${permission.slug}`);
        }
      } catch (error) {
        console.error(`  ❌ Failed to create permission ${permission.slug}:`, error.message);
        throw error;
      }
    }

    console.log(`✅ System permissions initialized: ${createdPermissions.length}`);
    return createdPermissions;
  }

  /**
   * Create system roles
   */
  async createSystemRoles() {
    console.log('👑 Creating system roles...');

    const roles = [
      {
        name: 'Super Administrator',
        slug: 'super-admin',
        description: 'Full platform administration access',
        level: 100,
        isSystem: true,
        color: '#EF4444',
        icon: 'Shield',
        permissions: [
          'platform.admin',
          'platform.users.manage',
          'platform.orgs.manage',
          'platform.config.manage',
          'platform.audit.view'
        ]
      },
      {
        name: 'Platform Admin',
        slug: 'platform-admin',
        description: 'Platform administration with limited access',
        level: 90,
        isSystem: true,
        color: '#F59E0B',
        icon: 'Settings',
        permissions: [
          'platform.orgs.manage',
          'platform.audit.view'
        ]
      },
      {
        name: 'Organization Owner',
        slug: 'org-owner',
        description: 'Organization owner with full access',
        level: 80,
        isSystem: false,
        color: '#8B5CF6',
        icon: 'Crown',
        permissions: [
          'org.admin',
          'warehouse.manage',
          'inventory.manage',
          'users.invite',
          'warehouse.view',
          'inventory.view',
          'profile.manage'
        ]
      },
      {
        name: 'Organization Admin',
        slug: 'org-admin',
        description: 'Organization administrator',
        level: 70,
        isSystem: false,
        color: '#06B6D4',
        icon: 'User',
        permissions: [
          'warehouse.manage',
          'inventory.manage',
          'users.invite',
          'warehouse.view',
          'inventory.view',
          'profile.manage'
        ]
      },
      {
        name: 'Warehouse Manager',
        slug: 'warehouse-manager',
        description: 'Warehouse management access',
        level: 60,
        isSystem: false,
        color: '#10B981',
        icon: 'Package',
        permissions: [
          'inventory.manage',
          'warehouse.view',
          'inventory.view',
          'profile.manage'
        ]
      },
      {
        name: 'Team Member',
        slug: 'team-member',
        description: 'Standard team member access',
        level: 50,
        isSystem: false,
        color: '#6B7280',
        icon: 'Users',
        permissions: [
          'warehouse.view',
          'inventory.view',
          'profile.manage'
        ]
      }
    ];

    const createdRoles = [];

    for (const roleData of roles) {
      try {
        let role = await this.prisma.role.findFirst({
          where: {
            slug: roleData.slug,
            organizationId: this.platformOrg.id
          }
        });

        if (!role) {
          role = await this.prisma.role.create({
            data: {
              name: roleData.name,
              slug: roleData.slug,
              description: roleData.description,
              level: roleData.level,
              isSystem: roleData.isSystem,
              color: roleData.color,
              icon: roleData.icon,
              organizationId: this.platformOrg.id
            }
          });
          console.log(`  ✅ Created role: ${roleData.slug}`);
        } else {
          console.log(`  ↻ Role exists: ${roleData.slug}`);
        }

        // Assign permissions to role
        for (const permissionSlug of roleData.permissions) {
          const permission = await this.prisma.permission.findFirst({
            where: {
              slug: permissionSlug,
              organizationId: this.platformOrg.id
            }
          });

          if (permission) {
            const existing = await this.prisma.rolePermission.findFirst({
              where: {
                roleId: role.id,
                permissionId: permission.id
              }
            });

            if (!existing) {
              await this.prisma.rolePermission.create({
                data: {
                  roleId: role.id,
                  permissionId: permission.id
                }
              });
            }
          }
        }

        createdRoles.push(role);

      } catch (error) {
        console.error(`  ❌ Failed to create role ${roleData.slug}:`, error.message);
        throw error;
      }
    }

    console.log(`✅ System roles initialized: ${createdRoles.length}`);
    return createdRoles;
  }

  /**
   * Create super admin user
   */
  async createSuperAdminUser() {
    console.log('👤 Creating super admin user...');

    try {
      // Check if super admin already exists
      this.superAdminUser = await this.prisma.user.findUnique({
        where: { email: this.credentials.superAdmin.email }
      });

      if (this.superAdminUser) {
        console.log('✅ Super admin user already exists');
        return this.superAdminUser;
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(this.credentials.superAdmin.password, 12);

      // Create super admin user
      this.superAdminUser = await this.prisma.user.create({
        data: {
          name: this.credentials.superAdmin.name,
          email: this.credentials.superAdmin.email,
          password: hashedPassword,
          emailVerified: new Date(),
          status: 'ACTIVE',
          organizationId: this.platformOrg.id,
          metadata: {
            isSystemUser: true,
            createdBy: 'system-init',
            setupDate: new Date().toISOString(),
            twoFactorSecret: this.credentials.superAdmin.twoFactorSecret,
            recoveryCode: this.credentials.superAdmin.recoveryCode,
            environment: 'production'
          }
        }
      });

      // Assign super admin role
      const superAdminRole = await this.prisma.role.findFirst({
        where: {
          slug: 'super-admin',
          organizationId: this.platformOrg.id
        }
      });

      if (superAdminRole) {
        await this.prisma.userRole.create({
          data: {
            userId: this.superAdminUser.id,
            roleId: superAdminRole.id
          }
        });
      }

      console.log(`✅ Super admin user created: ${this.superAdminUser.id}`);
      return this.superAdminUser;

    } catch (error) {
      console.error('❌ Failed to create super admin user:', error.message);
      throw error;
    }
  }

  /**
   * Initialize system configuration
   */
  async initializeSystemConfiguration() {
    console.log('⚙️ Initializing system configuration...');

    const configs = [
      {
        key: 'system.setup.completed',
        value: {
          completedAt: new Date().toISOString(),
          superAdminUserId: this.superAdminUser.id,
          platformOrgId: this.platformOrg.id,
          version: '1.0.0',
          environment: 'production'
        },
        description: 'System setup completion record',
        category: 'system'
      },
      {
        key: 'security.password.policy',
        value: {
          minLength: 12,
          requireUppercase: true,
          requireLowercase: true,
          requireNumbers: true,
          requireSymbols: true,
          maxAge: 90, // days
          historyCount: 5
        },
        description: 'Password policy configuration',
        category: 'security'
      },
      {
        key: 'security.session.config',
        value: {
          maxAge: 8, // hours
          rolling: true,
          secure: true,
          sameSite: 'strict',
          httpOnly: true
        },
        description: 'Session security configuration',
        category: 'security'
      },
      {
        key: 'features.default',
        value: {
          analytics: true,
          auditLogging: true,
          rateLimiting: true,
          twoFactorAuth: true,
          sso: false,
          apiAccess: true
        },
        description: 'Default feature flags',
        category: 'features'
      },
      {
        key: 'limits.default',
        value: {
          apiRateLimit: 1000, // per minute
          maxFileSize: 10485760, // 10MB
          maxUsers: 100,
          maxWarehouses: 10,
          sessionTimeout: 8 // hours
        },
        description: 'Default system limits',
        category: 'limits'
      }
    ];

    for (const config of configs) {
      try {
        await this.prisma.systemConfig.upsert({
          where: { key: config.key },
          update: {
            value: config.value,
            description: config.description,
            category: config.category
          },
          create: {
            key: config.key,
            value: config.value,
            description: config.description,
            category: config.category
          }
        });
        console.log(`  ✅ Config initialized: ${config.key}`);
      } catch (error) {
        console.error(`  ❌ Failed to initialize config ${config.key}:`, error.message);
        throw error;
      }
    }

    console.log('✅ System configuration initialized');
  }

  /**
   * Create initial audit log
   */
  async createInitialAuditLog() {
    console.log('📝 Creating initial audit log...');

    try {
      await this.prisma.auditLog.create({
        data: {
          userId: this.superAdminUser.id,
          organizationId: this.platformOrg.id,
          action: 'system.initialization',
          resource: 'system',
          details: {
            action: 'production_database_initialization',
            platformOrganizationId: this.platformOrg.id,
            superAdminUserId: this.superAdminUser.id,
            environment: 'production',
            timestamp: new Date().toISOString()
          },
          status: 'success',
          ipAddress: '127.0.0.1',
          userAgent: 'System Initialization Script'
        }
      });

      console.log('✅ Initial audit log created');
    } catch (error) {
      console.error('❌ Failed to create initial audit log:', error.message);
      throw error;
    }
  }

  /**
   * Verify database initialization
   */
  async verifyInitialization() {
    console.log('🔍 Verifying database initialization...');

    try {
      // Check platform organization
      const platformOrg = await this.prisma.organization.findFirst({
        where: { type: 'PLATFORM' }
      });

      if (!platformOrg) {
        throw new Error('Platform organization not found');
      }

      // Check super admin user
      const superAdmin = await this.prisma.user.findUnique({
        where: { email: this.credentials.superAdmin.email },
        include: {
          userRoles: {
            include: {
              role: true
            }
          }
        }
      });

      if (!superAdmin) {
        throw new Error('Super admin user not found');
      }

      // Check super admin role
      const hasSuperAdminRole = superAdmin.userRoles.some(ur => ur.role.slug === 'super-admin');
      if (!hasSuperAdminRole) {
        throw new Error('Super admin does not have super-admin role');
      }

      // Check system configuration
      const setupConfig = await this.prisma.systemConfig.findUnique({
        where: { key: 'system.setup.completed' }
      });

      if (!setupConfig) {
        throw new Error('System setup configuration not found');
      }

      // Count permissions and roles
      const permissionCount = await this.prisma.permission.count({
        where: { organizationId: platformOrg.id }
      });

      const roleCount = await this.prisma.role.count({
        where: { organizationId: platformOrg.id }
      });

      console.log('✅ Database initialization verified:');
      console.log(`   Platform Organization: ${platformOrg.name} (${platformOrg.id})`);
      console.log(`   Super Admin User: ${superAdmin.email} (${superAdmin.id})`);
      console.log(`   Permissions Created: ${permissionCount}`);
      console.log(`   Roles Created: ${roleCount}`);
      console.log(`   Setup Completed: ${setupConfig.value.completedAt}`);

      return true;

    } catch (error) {
      console.error('❌ Database verification failed:', error.message);
      throw error;
    }
  }

  /**
   * Run the complete database initialization
   */
  async initialize(credentialFile) {
    console.log('🚀 Starting production database initialization...\n');

    try {
      // Load credentials
      this.loadCredentials(credentialFile);

      // Initialize database connection
      await this.initializeConnection();

      // Create platform organization
      await this.createPlatformOrganization();

      // Create system permissions
      await this.createSystemPermissions();

      // Create system roles
      await this.createSystemRoles();

      // Create super admin user
      await this.createSuperAdminUser();

      // Initialize system configuration
      await this.initializeSystemConfiguration();

      // Create initial audit log
      await this.createInitialAuditLog();

      // Verify initialization
      await this.verifyInitialization();

      console.log('\n🎉 Production database initialization completed successfully!');

      return {
        platformOrganization: this.platformOrg,
        superAdminUser: this.superAdminUser,
        setupCompleted: true
      };

    } catch (error) {
      console.error('\n❌ Database initialization failed:', error.message);
      throw error;
    } finally {
      await this.prisma.$disconnect();
    }
  }
}

// CLI execution
async function main() {
  const credentialFile = process.argv[2] || './credentials/super-admin-credentials-*.json';

  // Find the most recent credential file
  let actualCredentialFile = credentialFile;
  if (credentialFile.includes('*')) {
    const dir = path.dirname(credentialFile);
    const pattern = path.basename(credentialFile);
    const files = fs.readdirSync(dir)
      .filter(f => f.match(pattern.replace('*', '.*')))
      .sort()
      .reverse();

    if (files.length === 0) {
      console.error('❌ No credential files found matching pattern:', credentialFile);
      process.exit(1);
    }

    actualCredentialFile = path.join(dir, files[0]);
    console.log(`📁 Using credential file: ${actualCredentialFile}`);
  }

  const initializer = new ProductionDatabaseInitializer();

  try {
    const result = await initializer.initialize(actualCredentialFile);
    console.log('\n📋 Next steps:');
    console.log('1. Test super admin login with generated credentials');
    console.log('2. Configure OAuth providers with actual client IDs and secrets');
    console.log('3. Set up SSL certificates for production domain');
    console.log('4. Configure rate limiting and security headers');
    console.log('5. Set up monitoring and alerting');

  } catch (error) {
    console.error('❌ Initialization failed:', error.message);
    process.exit(1);
  }
}

// Export for testing
if (require.main === module) {
  main();
} else {
  module.exports = ProductionDatabaseInitializer;
}