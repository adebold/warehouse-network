# ADR-003: Multi-Tenant SaaS Architecture Pattern

## Status
**Status**: Accepted
**Date**: 2026-03-23
**Relates to**: ADR-002 (Authentication Architecture)

## Context

### Multi-Tenancy Requirements
The Skidspace platform requires a sophisticated multi-tenant architecture that supports:
- **Warehouse Partners**: Independent businesses with isolated data
- **Ebike Businesses**: Cross-warehouse access with controlled permissions
- **Platform Operations**: Super admin oversight with global access
- **End Customers**: Simple access to relevant warehouse services

### Complexity Factors
- **Data Isolation**: Complete separation of tenant data for compliance
- **Performance**: Sub-100ms response times with thousands of tenants
- **Scalability**: Linear scaling with tenant count
- **Cost Efficiency**: Shared infrastructure with isolated resources
- **Compliance**: SOC2, GDPR requirements for data handling

## Multi-Tenancy Strategy Analysis

### Pattern Comparison

| Pattern | Data Isolation | Performance | Cost | Complexity | Selected |
|---------|---------------|-------------|------|------------|----------|
| **Database per Tenant** | Excellent | Good | High | Medium | ❌ |
| **Schema per Tenant** | Very Good | Good | Medium | High | ❌ |
| **Row Level Security (RLS)** | Good | Excellent | Low | Low | ✅ |
| **Application Level** | Fair | Excellent | Low | Medium | ❌ |

### Decision: Row Level Security (RLS) with Application Enforcement

**Primary Reasons**:
1. **Performance**: Single database connection pool, optimized queries
2. **Cost Efficiency**: Shared infrastructure with isolated access
3. **Scalability**: Linear scaling without database proliferation
4. **Simplicity**: Single schema to maintain and migrate
5. **Flexibility**: Easy to add cross-tenant features when needed

## Architecture Design

### Database Schema with RLS

```sql
-- Core tenant table
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subdomain VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  plan VARCHAR(50) DEFAULT 'basic',
  settings JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on all tenant-scoped tables
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL, -- 'warehouse', 'ebike_business'
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- RLS Policy for tenant isolation
CREATE POLICY tenant_isolation ON organizations
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

-- Cross-tenant access table for ebike businesses
CREATE TABLE cross_tenant_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_tenant_id UUID NOT NULL REFERENCES tenants(id),
  target_tenant_id UUID NOT NULL REFERENCES tenants(id),
  access_type VARCHAR(50) NOT NULL, -- 'inventory_read', 'order_create'
  granted_by UUID NOT NULL REFERENCES users(id),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(source_tenant_id, target_tenant_id, access_type)
);
```

### Tenant Resolution Strategy

```typescript
// middleware.ts - Multi-level tenant resolution
export async function resolveTenant(request: NextRequest): Promise<Tenant> {
  // 1. Subdomain-based resolution (primary)
  const hostname = request.headers.get('host') || ''
  const subdomain = extractSubdomain(hostname)

  if (subdomain && subdomain !== 'www') {
    const tenant = await getTenantBySubdomain(subdomain)
    if (tenant?.isActive) {
      return tenant
    }
  }

  // 2. Path-based resolution (backup)
  const pathname = request.nextUrl.pathname
  const pathTenant = extractTenantFromPath(pathname)

  if (pathTenant) {
    const tenant = await getTenantBySubdomain(pathTenant)
    if (tenant?.isActive) {
      return tenant
    }
  }

  // 3. Header-based resolution (API)
  const tenantHeader = request.headers.get('x-tenant-id')
  if (tenantHeader) {
    const tenant = await getTenantById(tenantHeader)
    if (tenant?.isActive) {
      return tenant
    }
  }

  // 4. Default platform tenant
  return await getDefaultTenant()
}

// Tenant context setting for RLS
export async function setTenantContext(tenantId: string) {
  await prisma.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`
}
```

### Application-Level Isolation

```typescript
// lib/tenant-aware-db.ts - Tenant-aware database client
export class TenantAwareDB {
  private prisma: PrismaClient
  private currentTenant: string | null = null

  constructor() {
    this.prisma = new PrismaClient()
  }

  async setTenant(tenantId: string) {
    this.currentTenant = tenantId
    // Set PostgreSQL session variable for RLS
    await this.prisma.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`
  }

  // Tenant-scoped query methods
  async findMany<T>(model: string, args: any = {}) {
    if (!this.currentTenant) {
      throw new Error('Tenant context not set')
    }

    // Add tenant filter to where clause
    const tenantFilter = { tenant_id: this.currentTenant }
    const where = args.where ? { ...args.where, ...tenantFilter } : tenantFilter

    return await (this.prisma as any)[model].findMany({
      ...args,
      where
    })
  }

  async create<T>(model: string, args: any) {
    if (!this.currentTenant) {
      throw new Error('Tenant context not set')
    }

    // Inject tenant_id into create data
    const data = {
      ...args.data,
      tenant_id: this.currentTenant
    }

    return await (this.prisma as any)[model].create({
      ...args,
      data
    })
  }
}

// Usage in API routes
export async function withTenant<T>(
  tenantId: string,
  operation: (db: TenantAwareDB) => Promise<T>
): Promise<T> {
  const db = new TenantAwareDB()
  await db.setTenant(tenantId)
  return await operation(db)
}
```

## Cross-Tenant Access Patterns

### Ebike Business Cross-Warehouse Access

```typescript
// Cross-tenant permission checking
export async function checkCrossTenantAccess(
  userId: string,
  sourceTenantId: string,
  targetTenantId: string,
  accessType: string
): Promise<boolean> {

  // Check if user has permission in source tenant
  const sourcePermission = await getUserTenantRole(userId, sourceTenantId)
  if (!sourcePermission || !['admin', 'manager'].includes(sourcePermission.role)) {
    return false
  }

  // Check if cross-tenant access is granted
  const crossAccess = await prisma.crossTenantAccess.findFirst({
    where: {
      sourceTenantId,
      targetTenantId,
      accessType,
      isActive: true,
      OR: [
        { expiresAt: { gte: new Date() } },
        { expiresAt: null }
      ]
    }
  })

  return !!crossAccess
}

// Cross-tenant data access
export async function getCrossTenantData(
  userId: string,
  sourceTenantId: string,
  targetTenantId: string,
  resourceType: string
) {
  // Verify access permission
  const hasAccess = await checkCrossTenantAccess(
    userId,
    sourceTenantId,
    targetTenantId,
    `${resourceType}_read`
  )

  if (!hasAccess) {
    throw new Error('Cross-tenant access denied')
  }

  // Temporarily switch tenant context
  const originalTenant = getCurrentTenant()
  await setTenantContext(targetTenantId)

  try {
    // Fetch data with target tenant context
    const data = await fetchResourceData(resourceType)
    return data
  } finally {
    // Restore original tenant context
    await setTenantContext(originalTenant)
  }
}
```

### Super Admin Global Access

```typescript
// Super admin bypass for RLS
export async function withSuperAdminAccess<T>(
  operation: () => Promise<T>
): Promise<T> {
  // Temporarily disable RLS for super admin operations
  await prisma.$executeRaw`SET row_security = off`

  try {
    return await operation()
  } finally {
    // Re-enable RLS
    await prisma.$executeRaw`SET row_security = on`
  }
}

// Super admin tenant management
export class SuperAdminService {
  async getAllTenants() {
    return await withSuperAdminAccess(async () => {
      return await prisma.tenant.findMany({
        include: {
          organizations: true,
          _count: {
            select: {
              organizations: true,
              userTenantAccess: { where: { isActive: true } }
            }
          }
        }
      })
    })
  }

  async getTenantMetrics(tenantId: string) {
    return await withSuperAdminAccess(async () => {
      return await prisma.$queryRaw`
        SELECT
          COUNT(DISTINCT o.id) as organization_count,
          COUNT(DISTINCT uta.user_id) as user_count,
          COUNT(DISTINCT CASE WHEN uta.role = 'admin' THEN uta.user_id END) as admin_count
        FROM tenants t
        LEFT JOIN organizations o ON t.id = o.tenant_id
        LEFT JOIN user_tenant_access uta ON t.id = uta.tenant_id AND uta.is_active = true
        WHERE t.id = ${tenantId}
        GROUP BY t.id
      `
    })
  }
}
```

## Performance Optimization

### Tenant-Aware Caching

```typescript
// Redis-based tenant-scoped caching
export class TenantCache {
  private redis: Redis

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT || '6379'),
      keyPrefix: 'tenant:'
    })
  }

  private getTenantKey(tenantId: string, key: string): string {
    return `${tenantId}:${key}`
  }

  async get(tenantId: string, key: string): Promise<any> {
    const data = await this.redis.get(this.getTenantKey(tenantId, key))
    return data ? JSON.parse(data) : null
  }

  async set(tenantId: string, key: string, value: any, ttl: number = 300): Promise<void> {
    await this.redis.setex(
      this.getTenantKey(tenantId, key),
      ttl,
      JSON.stringify(value)
    )
  }

  async del(tenantId: string, key: string): Promise<void> {
    await this.redis.del(this.getTenantKey(tenantId, key))
  }

  // Bulk operations for tenant data
  async invalidateTenant(tenantId: string): Promise<void> {
    const pattern = this.getTenantKey(tenantId, '*')
    const keys = await this.redis.keys(pattern)
    if (keys.length > 0) {
      await this.redis.del(...keys)
    }
  }
}
```

### Database Connection Optimization

```typescript
// Tenant-aware connection pooling
export class TenantConnectionManager {
  private pools: Map<string, PrismaClient> = new Map()
  private maxPoolSize = 10

  async getConnection(tenantId: string): Promise<PrismaClient> {
    if (this.pools.has(tenantId)) {
      return this.pools.get(tenantId)!
    }

    // Create new connection with tenant context
    const prisma = new PrismaClient({
      datasources: {
        db: {
          url: this.buildTenantUrl(tenantId)
        }
      }
    })

    // Set tenant context immediately
    await prisma.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`

    this.pools.set(tenantId, prisma)
    return prisma
  }

  private buildTenantUrl(tenantId: string): string {
    const baseUrl = process.env.DATABASE_URL!
    // Add tenant-specific connection parameters
    return `${baseUrl}&application_name=tenant_${tenantId}`
  }

  async cleanup(): Promise<void> {
    for (const [tenantId, prisma] of this.pools) {
      await prisma.$disconnect()
    }
    this.pools.clear()
  }
}
```

## Tenant Onboarding & Management

### Automated Tenant Provisioning

```typescript
// Tenant onboarding service
export class TenantOnboardingService {
  async provisionTenant(tenantData: CreateTenantInput): Promise<Tenant> {
    return await prisma.$transaction(async (tx) => {
      // 1. Create tenant
      const tenant = await tx.tenant.create({
        data: {
          subdomain: tenantData.subdomain,
          name: tenantData.name,
          plan: tenantData.plan || 'basic',
          settings: tenantData.settings || {}
        }
      })

      // 2. Create default organization
      const organization = await tx.organization.create({
        data: {
          tenantId: tenant.id,
          name: tenantData.organizationName || tenantData.name,
          type: tenantData.organizationType,
          settings: {}
        }
      })

      // 3. Create admin user for tenant
      if (tenantData.adminUser) {
        const adminUser = await tx.user.create({
          data: {
            email: tenantData.adminUser.email,
            name: tenantData.adminUser.name,
            emailVerified: new Date()
          }
        })

        // 4. Assign admin role
        await tx.userTenantAccess.create({
          data: {
            userId: adminUser.id,
            tenantId: tenant.id,
            organizationId: organization.id,
            role: 'admin',
            permissions: defaultAdminPermissions,
            grantedBy: adminUser.id // Self-granted for initial admin
          }
        })
      }

      // 5. Set up default tenant configuration
      await this.setupDefaultTenantConfig(tenant.id, tx)

      return tenant
    })
  }

  private async setupDefaultTenantConfig(tenantId: string, tx: any) {
    // Create default roles and permissions
    const defaultRoles = [
      { name: 'admin', permissions: ['*'] },
      { name: 'manager', permissions: ['read', 'write', 'user_manage'] },
      { name: 'staff', permissions: ['read', 'write'] },
      { name: 'viewer', permissions: ['read'] }
    ]

    for (const role of defaultRoles) {
      await tx.tenantRole.create({
        data: {
          tenantId,
          name: role.name,
          permissions: role.permissions,
          isDefault: role.name === 'viewer'
        }
      })
    }
  }
}
```

### Tenant Resource Management

```typescript
// Resource quotas and limits
export class TenantResourceManager {
  async checkQuota(tenantId: string, resource: string, amount: number): Promise<boolean> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { plan: true }
    })

    if (!tenant) return false

    const usage = await this.getCurrentUsage(tenantId, resource)
    const limit = this.getResourceLimit(tenant.plan, resource)

    return (usage + amount) <= limit
  }

  private async getCurrentUsage(tenantId: string, resource: string): Promise<number> {
    switch (resource) {
      case 'users':
        return await prisma.userTenantAccess.count({
          where: { tenantId, isActive: true }
        })

      case 'storage':
        // Calculate storage usage across tenant data
        const result = await prisma.$queryRaw`
          SELECT COALESCE(SUM(size), 0) as total_size
          FROM files
          WHERE tenant_id = ${tenantId}
        `
        return Number((result as any)[0]?.total_size || 0)

      case 'api_calls':
        // Get API call count for current month
        return await this.getAPIUsage(tenantId)

      default:
        return 0
    }
  }

  private getResourceLimit(plan: TenantPlan, resource: string): number {
    const limits = {
      basic: { users: 50, storage: 10 * 1024 * 1024 * 1024, api_calls: 10000 },
      professional: { users: 200, storage: 100 * 1024 * 1024 * 1024, api_calls: 100000 },
      enterprise: { users: 1000, storage: 1024 * 1024 * 1024 * 1024, api_calls: 1000000 }
    }

    return limits[plan.name as keyof typeof limits]?.[resource as keyof (typeof limits)['basic']] || 0
  }
}
```

## Security Considerations

### RLS Policy Security

```sql
-- Advanced RLS policies for different access patterns

-- Organization-level access with role checking
CREATE POLICY organization_role_access ON sensitive_data
  USING (
    tenant_id = current_setting('app.current_tenant_id', true)::UUID
    AND EXISTS (
      SELECT 1 FROM user_tenant_access uta
      WHERE uta.user_id = current_setting('app.current_user_id', true)::UUID
        AND uta.tenant_id = current_setting('app.current_tenant_id', true)::UUID
        AND uta.is_active = true
        AND uta.role IN ('admin', 'manager')
    )
  );

-- Time-based access restrictions
CREATE POLICY time_restricted_access ON financial_data
  USING (
    tenant_id = current_setting('app.current_tenant_id', true)::UUID
    AND (
      -- Allow access during business hours only
      EXTRACT(hour FROM NOW()) BETWEEN 9 AND 17
      OR
      -- Unless user is admin
      EXISTS (
        SELECT 1 FROM user_tenant_access uta
        WHERE uta.user_id = current_setting('app.current_user_id', true)::UUID
          AND uta.tenant_id = current_setting('app.current_tenant_id', true)::UUID
          AND uta.role = 'admin'
      )
    )
  );
```

### Audit Logging

```typescript
// Comprehensive audit logging for multi-tenant operations
export class TenantAuditLogger {
  async log(event: AuditEvent): Promise<void> {
    await prisma.auditLog.create({
      data: {
        tenantId: event.tenantId,
        userId: event.userId,
        action: event.action,
        resource: event.resource,
        resourceId: event.resourceId,
        metadata: event.metadata,
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
        timestamp: new Date()
      }
    })
  }

  // Track cross-tenant access
  async logCrossTenantAccess(
    userId: string,
    sourceTenantId: string,
    targetTenantId: string,
    resource: string,
    success: boolean
  ): Promise<void> {
    await this.log({
      tenantId: sourceTenantId,
      userId,
      action: success ? 'CROSS_TENANT_ACCESS' : 'CROSS_TENANT_ACCESS_DENIED',
      resource: 'tenant',
      resourceId: targetTenantId,
      metadata: {
        targetTenantId,
        resource,
        success
      },
      ipAddress: getCurrentIP(),
      userAgent: getCurrentUserAgent()
    })
  }
}
```

## Monitoring & Metrics

### Tenant-Specific Metrics

```typescript
// Comprehensive tenant monitoring
export class TenantMetricsService {
  async getTenantHealth(tenantId: string): Promise<TenantHealth> {
    const [
      activeUsers,
      storageUsage,
      apiCalls,
      errorRate,
      responseTime
    ] = await Promise.all([
      this.getActiveUsers(tenantId),
      this.getStorageUsage(tenantId),
      this.getAPICallCount(tenantId),
      this.getErrorRate(tenantId),
      this.getAverageResponseTime(tenantId)
    ])

    return {
      tenantId,
      activeUsers,
      storageUsage,
      apiCalls,
      errorRate,
      responseTime,
      healthScore: this.calculateHealthScore({
        activeUsers,
        storageUsage,
        errorRate,
        responseTime
      })
    }
  }

  private calculateHealthScore(metrics: any): number {
    // Calculate composite health score
    let score = 100

    // Penalize high error rates
    if (metrics.errorRate > 5) score -= 20
    else if (metrics.errorRate > 1) score -= 10

    // Penalize slow response times
    if (metrics.responseTime > 1000) score -= 15
    else if (metrics.responseTime > 500) score -= 5

    // Penalize excessive storage usage
    if (metrics.storageUsage > 0.9) score -= 10
    else if (metrics.storageUsage > 0.8) score -= 5

    return Math.max(0, score)
  }
}
```

## Migration Strategy

### Zero-Downtime Migrations

```typescript
// Tenant-aware migration system
export class TenantMigrationService {
  async runMigration(migrationName: string): Promise<void> {
    const tenants = await prisma.tenant.findMany({ where: { isActive: true } })

    console.log(`Running migration ${migrationName} for ${tenants.length} tenants`)

    for (const tenant of tenants) {
      await this.runTenantMigration(tenant.id, migrationName)
    }
  }

  private async runTenantMigration(tenantId: string, migrationName: string): Promise<void> {
    try {
      // Set tenant context for migration
      await setTenantContext(tenantId)

      // Run tenant-specific migration logic
      await this.executeMigrationSteps(migrationName)

      // Log successful migration
      await this.logMigrationResult(tenantId, migrationName, 'success')

    } catch (error) {
      // Log failed migration
      await this.logMigrationResult(tenantId, migrationName, 'failed', error)
      throw error
    }
  }

  private async logMigrationResult(
    tenantId: string,
    migrationName: string,
    status: 'success' | 'failed',
    error?: any
  ): Promise<void> {
    await prisma.migrationLog.create({
      data: {
        tenantId,
        migrationName,
        status,
        error: error ? JSON.stringify(error) : null,
        executedAt: new Date()
      }
    })
  }
}
```

## Success Metrics

### Performance Targets
- **Query Response Time**: < 50ms p95 for tenant-scoped queries
- **Cross-Tenant Query Time**: < 100ms p95 for authorized cross-tenant access
- **Cache Hit Rate**: > 95% for tenant configuration and permissions
- **Database Connection Efficiency**: < 10ms connection establishment

### Scalability Metrics
- **Tenant Onboarding Time**: < 30 seconds automated provisioning
- **Support for Tenants**: 10,000+ tenants on single database
- **Concurrent Users per Tenant**: 1,000+ simultaneous users
- **Cross-Tenant Operations**: < 5% performance overhead

### Security Metrics
- **Data Isolation Verification**: 100% pass rate on tenant isolation tests
- **Cross-Tenant Access Audit**: Complete audit trail for all cross-tenant operations
- **RLS Policy Coverage**: 100% of sensitive tables protected by RLS
- **Security Incident Rate**: 0 tenant data leakage incidents

## Conclusion

The Row Level Security (RLS) approach with application-level enforcement provides the optimal balance of performance, security, and scalability for the Skidspace multi-tenant platform.

**Key Benefits**:
- ✅ **Performance**: Single database with optimized connection pooling
- ✅ **Security**: Database-level isolation with application enforcement
- ✅ **Scalability**: Linear scaling without database proliferation
- ✅ **Flexibility**: Easy to implement cross-tenant features when needed
- ✅ **Cost Efficiency**: Shared infrastructure with isolated access

**Implementation Timeline**: Integrated with authentication implementation (Weeks 2-3)
**Risk Level**: Low - Battle-tested pattern with clear implementation path

---

**Next Actions**:
1. Implement RLS policies during database setup
2. Integrate tenant resolution with NextAuth.js middleware
3. Create tenant-aware database access patterns
4. Set up comprehensive monitoring and metrics
5. Test cross-tenant access controls thoroughly