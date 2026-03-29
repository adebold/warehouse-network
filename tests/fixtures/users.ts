import { CreateTestUserOptions } from '../utils/auth-helpers'

export const testUsers: Record<string, CreateTestUserOptions> = {
  superAdmin: {
    email: 'admin@skidspace.com',
    password: 'SuperSecure123!',
    name: 'Platform Super Admin',
    role: 'SUPER_ADMIN',
    emailVerified: true,
  },

  warehouseAdmin1: {
    email: 'warehouse1@example.com',
    password: 'WarehouseSecure123!',
    name: 'Warehouse Admin 1',
    role: 'WAREHOUSE_ADMIN',
    organizationId: 'warehouse-org-1',
    tenantId: 'warehouse-tenant-1',
    emailVerified: true,
  },

  warehouseAdmin2: {
    email: 'warehouse2@example.com',
    password: 'WarehouseSecure123!',
    name: 'Warehouse Admin 2',
    role: 'WAREHOUSE_ADMIN',
    organizationId: 'warehouse-org-2',
    tenantId: 'warehouse-tenant-2',
    emailVerified: true,
  },

  businessManager1: {
    email: 'business1@example.com',
    password: 'BusinessSecure123!',
    name: 'Business Manager 1',
    role: 'BUSINESS_MANAGER',
    organizationId: 'business-org-1',
    tenantId: 'business-tenant-1',
    emailVerified: true,
  },

  businessManager2: {
    email: 'business2@example.com',
    password: 'BusinessSecure123!',
    name: 'Business Manager 2',
    role: 'BUSINESS_MANAGER',
    organizationId: 'business-org-2',
    tenantId: 'business-tenant-2',
    emailVerified: true,
  },

  customer1: {
    email: 'customer1@example.com',
    password: 'CustomerSecure123!',
    name: 'Customer 1',
    role: 'CUSTOMER',
    tenantId: 'customer-tenant-1',
    emailVerified: true,
  },

  customer2: {
    email: 'customer2@example.com',
    password: 'CustomerSecure123!',
    name: 'Customer 2',
    role: 'CUSTOMER',
    tenantId: 'customer-tenant-2',
    emailVerified: true,
  },

  unverifiedUser: {
    email: 'unverified@example.com',
    password: 'UnverifiedSecure123!',
    name: 'Unverified User',
    role: 'CUSTOMER',
    tenantId: 'unverified-tenant',
    emailVerified: false,
  },

  // Test users for security testing
  maliciousUser: {
    email: 'malicious@example.com',
    password: 'MaliciousSecure123!',
    name: 'Malicious User',
    role: 'CUSTOMER',
    tenantId: 'malicious-tenant',
    emailVerified: true,
  },
}

export const testOrganizations = {
  warehouseOrg1: {
    id: 'warehouse-org-1',
    name: 'Premium Warehouse Solutions',
    tenantId: 'warehouse-tenant-1',
    settings: {
      capacityLimit: 1000,
      allowedStorageTypes: ['electronics', 'automotive', 'general'],
      operatingHours: {
        monday: { open: '08:00', close: '18:00' },
        tuesday: { open: '08:00', close: '18:00' },
        wednesday: { open: '08:00', close: '18:00' },
        thursday: { open: '08:00', close: '18:00' },
        friday: { open: '08:00', close: '18:00' },
        saturday: { open: '09:00', close: '15:00' },
        sunday: { closed: true },
      },
    },
  },

  warehouseOrg2: {
    id: 'warehouse-org-2',
    name: 'Metro Storage Hub',
    tenantId: 'warehouse-tenant-2',
    settings: {
      capacityLimit: 500,
      allowedStorageTypes: ['ebikes', 'scooters', 'automotive'],
      operatingHours: {
        monday: { open: '07:00', close: '19:00' },
        tuesday: { open: '07:00', close: '19:00' },
        wednesday: { open: '07:00', close: '19:00' },
        thursday: { open: '07:00', close: '19:00' },
        friday: { open: '07:00', close: '19:00' },
        saturday: { open: '08:00', close: '16:00' },
        sunday: { open: '10:00', close: '14:00' },
      },
    },
  },

  businessOrg1: {
    id: 'business-org-1',
    name: 'EBike Innovations Inc',
    tenantId: 'business-tenant-1',
    settings: {
      subscriptionTier: 'premium',
      storageQuota: 100,
      monthlyOrderLimit: 1000,
    },
  },

  businessOrg2: {
    id: 'business-org-2',
    name: 'Urban Mobility Solutions',
    tenantId: 'business-tenant-2',
    settings: {
      subscriptionTier: 'standard',
      storageQuota: 50,
      monthlyOrderLimit: 500,
    },
  },
}

export const testTenants = {
  warehouseTenant1: {
    id: 'warehouse-tenant-1',
    name: 'Premium Warehouse Tenant',
    type: 'WAREHOUSE',
    settings: {
      region: 'us-west',
      compliance: ['PCI', 'SOC2'],
      features: ['advanced-analytics', 'api-access', 'white-label'],
    },
  },

  warehouseTenant2: {
    id: 'warehouse-tenant-2',
    name: 'Metro Storage Tenant',
    type: 'WAREHOUSE',
    settings: {
      region: 'us-east',
      compliance: ['SOC2'],
      features: ['basic-analytics', 'api-access'],
    },
  },

  businessTenant1: {
    id: 'business-tenant-1',
    name: 'EBike Business Tenant',
    type: 'BUSINESS',
    settings: {
      region: 'us-west',
      compliance: ['GDPR'],
      features: ['inventory-management', 'reporting'],
    },
  },

  businessTenant2: {
    id: 'business-tenant-2',
    name: 'Urban Mobility Tenant',
    type: 'BUSINESS',
    settings: {
      region: 'us-central',
      compliance: ['GDPR'],
      features: ['inventory-management'],
    },
  },
}