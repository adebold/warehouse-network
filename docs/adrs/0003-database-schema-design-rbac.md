# ADR-0003: Database Schema Design for Role-Based Access Control

## Status
**Accepted** - Date: 2026-03-23

## Context
The Skidspace platform requires a sophisticated role-based access control (RBAC) system to manage complex hierarchies across warehouse partners, ebike businesses, customers, and platform administrators. The system must support fine-grained permissions, tenant isolation, and scalable user management.

## Decision
**Selected: Hybrid RBAC with Role Hierarchies + Attribute-Based Permissions**

## Rationale

### Requirements Analysis
- **Multi-Tenant RBAC**: Roles scoped to specific tenants with inheritance
- **Complex Hierarchies**: Warehouse managers > employees > customers
- **Cross-Tenant Roles**: Platform admins with global access
- **Dynamic Permissions**: Business logic-driven access control
- **Audit Trail**: Complete permissions tracking and history
- **Performance**: Sub-100ms permission checks

### Alternative Approaches

#### 1. Simple Role-Based (Rejected)
```sql
-- Too simplistic for complex business needs
users (id, email, role)
WHERE role IN ('admin', 'user', 'customer')
```
**Limitations**: No tenant isolation, no permission granularity

#### 2. ACL (Access Control Lists) (Rejected)
```sql
-- Too granular, performance issues
permissions (user_id, resource_type, resource_id, permission)
```
**Limitations**: Millions of permission records, complex queries

#### 3. Hybrid RBAC + ABAC (Selected)
Combines role-based foundation with attribute-based flexibility

## Schema Design

### 1. Core RBAC Tables

```sql
-- Global roles (platform-wide)
CREATE TABLE platform.roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    scope VARCHAR(50) NOT NULL, -- 'global', 'tenant', 'resource'
    level INTEGER NOT NULL DEFAULT 0, -- Hierarchy level (0=highest)
    permissions JSONB NOT NULL DEFAULT '{}',
    metadata JSONB NOT NULL DEFAULT '{}',
    is_system BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(name, scope)
);

-- Insert system roles
INSERT INTO platform.roles (name, description, scope, level, permissions, is_system) VALUES
('platform_admin', 'Platform Administrator', 'global', 0,
 '{"platform": "*", "tenants": "*", "users": "*"}', true),
('tenant_admin', 'Tenant Administrator', 'tenant', 10,
 '{"tenant": "*", "users": ["read", "create", "update"], "warehouses": "*"}', true),
('warehouse_manager', 'Warehouse Manager', 'tenant', 20,
 '{"warehouses": ["read", "update"], "inventory": "*", "orders": "*"}', true),
('warehouse_employee', 'Warehouse Employee', 'tenant', 30,
 '{"warehouses": ["read"], "inventory": ["read", "update"], "orders": ["read", "update"]}', true),
('customer', 'Customer', 'tenant', 40,
 '{"orders": ["read", "create"], "inventory": ["read"]}', true),
('viewer', 'Read-only Viewer', 'tenant', 50,
 '{"*": ["read"]}', true);

-- Tenant-specific role assignments
CREATE TABLE platform.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES platform.users(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES platform.tenants(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES platform.roles(id) ON DELETE CASCADE,
    granted_by UUID NOT NULL REFERENCES platform.users(id),
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    is_active BOOLEAN NOT NULL DEFAULT true,
    conditions JSONB, -- Attribute-based conditions

    UNIQUE(user_id, tenant_id, role_id)
);

-- Resource-specific permissions (fine-grained control)
CREATE TABLE platform.resource_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES platform.users(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES platform.tenants(id) ON DELETE CASCADE,
    resource_type VARCHAR(100) NOT NULL, -- 'warehouse', 'order', 'inventory'
    resource_id UUID, -- Specific resource ID (NULL = all resources of type)
    permissions TEXT[] NOT NULL, -- ['read', 'write', 'delete']
    granted_by UUID NOT NULL REFERENCES platform.users(id),
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    conditions JSONB, -- Attribute conditions

    UNIQUE(user_id, tenant_id, resource_type, resource_id)
);

-- Permission inheritance and role hierarchy
CREATE TABLE platform.role_hierarchy (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_role_id UUID NOT NULL REFERENCES platform.roles(id) ON DELETE CASCADE,
    child_role_id UUID NOT NULL REFERENCES platform.roles(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES platform.tenants(id) ON DELETE CASCADE,

    UNIQUE(parent_role_id, child_role_id, tenant_id)
);

-- Audit trail for permission changes
CREATE TABLE platform.permission_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES platform.users(id),
    tenant_id UUID REFERENCES platform.tenants(id),
    action VARCHAR(50) NOT NULL, -- 'grant', 'revoke', 'update'
    resource_type VARCHAR(100),
    resource_id UUID,
    old_permissions JSONB,
    new_permissions JSONB,
    performed_by UUID NOT NULL REFERENCES platform.users(id),
    reason TEXT,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 2. Optimized Permission Checking

```sql
-- Materialized view for fast permission lookups
CREATE MATERIALIZED VIEW platform.user_permissions_cache AS
SELECT DISTINCT
    ur.user_id,
    ur.tenant_id,
    r.name as role_name,
    r.level as role_level,
    r.permissions,
    ur.expires_at,
    ur.is_active,
    ur.conditions
FROM platform.user_roles ur
JOIN platform.roles r ON ur.role_id = r.id
WHERE ur.is_active = true
  AND (ur.expires_at IS NULL OR ur.expires_at > CURRENT_TIMESTAMP);

-- Create indexes for performance
CREATE INDEX idx_user_permissions_cache_user_tenant
ON platform.user_permissions_cache(user_id, tenant_id);

CREATE INDEX idx_user_permissions_cache_tenant
ON platform.user_permissions_cache(tenant_id);

-- Refresh function
CREATE OR REPLACE FUNCTION refresh_user_permissions_cache()
RETURNS VOID AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY platform.user_permissions_cache;
END;
$$ LANGUAGE plpgsql;

-- Auto-refresh trigger
CREATE OR REPLACE FUNCTION trigger_refresh_permissions()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM refresh_user_permissions_cache();
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER refresh_permissions_trigger
AFTER INSERT OR UPDATE OR DELETE ON platform.user_roles
FOR EACH STATEMENT EXECUTE FUNCTION trigger_refresh_permissions();
```

### 3. Advanced Permission Functions

```sql
-- Check if user has permission
CREATE OR REPLACE FUNCTION check_user_permission(
    p_user_id UUID,
    p_tenant_id UUID,
    p_resource_type VARCHAR,
    p_action VARCHAR,
    p_resource_id UUID DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
    has_permission BOOLEAN := FALSE;
    role_perms JSONB;
    resource_perms TEXT[];
BEGIN
    -- Check role-based permissions
    FOR role_perms IN
        SELECT permissions
        FROM platform.user_permissions_cache
        WHERE user_id = p_user_id
          AND (tenant_id = p_tenant_id OR tenant_id IS NULL)
          AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
        ORDER BY role_level ASC
    LOOP
        -- Check wildcard permission
        IF role_perms ? '*' AND role_perms->>'*' = '*' THEN
            RETURN TRUE;
        END IF;

        -- Check resource-specific permission
        IF role_perms ? p_resource_type THEN
            IF role_perms->>p_resource_type = '*' THEN
                RETURN TRUE;
            END IF;

            -- Check specific actions
            IF role_perms->p_resource_type ? p_action THEN
                RETURN TRUE;
            END IF;
        END IF;
    END LOOP;

    -- Check resource-specific permissions
    SELECT permissions INTO resource_perms
    FROM platform.resource_permissions
    WHERE user_id = p_user_id
      AND (tenant_id = p_tenant_id OR tenant_id IS NULL)
      AND resource_type = p_resource_type
      AND (resource_id = p_resource_id OR resource_id IS NULL)
      AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
    LIMIT 1;

    IF resource_perms IS NOT NULL AND p_action = ANY(resource_perms) THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Get user's effective permissions for a tenant
CREATE OR REPLACE FUNCTION get_user_permissions(
    p_user_id UUID,
    p_tenant_id UUID
) RETURNS TABLE(
    resource_type VARCHAR,
    actions TEXT[],
    conditions JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT
        perm.key as resource_type,
        CASE
            WHEN perm.value::TEXT = '"*"' THEN ARRAY['*']
            ELSE ARRAY(SELECT jsonb_array_elements_text(perm.value))
        END as actions,
        upc.conditions
    FROM platform.user_permissions_cache upc,
         jsonb_each(upc.permissions) as perm(key, value)
    WHERE upc.user_id = p_user_id
      AND (upc.tenant_id = p_tenant_id OR upc.tenant_id IS NULL)
      AND (upc.expires_at IS NULL OR upc.expires_at > CURRENT_TIMESTAMP)

    UNION

    SELECT
        rp.resource_type,
        rp.permissions as actions,
        rp.conditions
    FROM platform.resource_permissions rp
    WHERE rp.user_id = p_user_id
      AND (rp.tenant_id = p_tenant_id OR rp.tenant_id IS NULL)
      AND (rp.expires_at IS NULL OR rp.expires_at > CURRENT_TIMESTAMP);
END;
$$ LANGUAGE plpgsql;
```

## TypeScript Implementation

### 1. Permission Service

```typescript
// lib/auth/permissions.ts
export interface Permission {
  resourceType: string
  actions: string[]
  conditions?: Record<string, any>
  resourceId?: string
}

export interface UserRole {
  id: string
  name: string
  level: number
  permissions: Record<string, any>
  tenantId?: string
  expiresAt?: Date
  conditions?: Record<string, any>
}

export class PermissionService {
  private cache = new Map<string, UserRole[]>()
  private cacheExpiry = new Map<string, number>()

  async getUserPermissions(
    userId: string,
    tenantId?: string
  ): Promise<Permission[]> {
    const cacheKey = `${userId}:${tenantId || 'global'}`

    // Check cache
    if (this.isValidCache(cacheKey)) {
      return this.parsePermissions(this.cache.get(cacheKey)!)
    }

    // Fetch from database
    const roles = await this.fetchUserRoles(userId, tenantId)

    // Cache results
    this.cache.set(cacheKey, roles)
    this.cacheExpiry.set(cacheKey, Date.now() + 300000) // 5 minutes

    return this.parsePermissions(roles)
  }

  async checkPermission(
    userId: string,
    tenantId: string,
    resourceType: string,
    action: string,
    resourceId?: string,
    context?: Record<string, any>
  ): Promise<boolean> {
    const permissions = await this.getUserPermissions(userId, tenantId)

    for (const permission of permissions) {
      if (this.matchesPermission(permission, resourceType, action, resourceId, context)) {
        return true
      }
    }

    return false
  }

  private async fetchUserRoles(userId: string, tenantId?: string): Promise<UserRole[]> {
    const result = await prisma.$queryRaw<UserRole[]>`
      SELECT
        r.id,
        r.name,
        r.level,
        r.permissions,
        ur.tenant_id as "tenantId",
        ur.expires_at as "expiresAt",
        ur.conditions
      FROM platform.user_roles ur
      JOIN platform.roles r ON ur.role_id = r.id
      WHERE ur.user_id = ${userId}
        AND ur.is_active = true
        AND (ur.expires_at IS NULL OR ur.expires_at > CURRENT_TIMESTAMP)
        AND (${tenantId}::UUID IS NULL OR ur.tenant_id = ${tenantId}::UUID OR ur.tenant_id IS NULL)
      ORDER BY r.level ASC
    `

    return result
  }

  private parsePermissions(roles: UserRole[]): Permission[] {
    const permissions: Permission[] = []

    for (const role of roles) {
      for (const [resourceType, actions] of Object.entries(role.permissions)) {
        permissions.push({
          resourceType,
          actions: Array.isArray(actions) ? actions : actions === '*' ? ['*'] : [actions],
          conditions: role.conditions
        })
      }
    }

    return permissions
  }

  private matchesPermission(
    permission: Permission,
    resourceType: string,
    action: string,
    resourceId?: string,
    context?: Record<string, any>
  ): boolean {
    // Check resource type
    if (permission.resourceType !== '*' && permission.resourceType !== resourceType) {
      return false
    }

    // Check action
    if (!permission.actions.includes('*') && !permission.actions.includes(action)) {
      return false
    }

    // Check conditions (attribute-based)
    if (permission.conditions && context) {
      if (!this.evaluateConditions(permission.conditions, context)) {
        return false
      }
    }

    return true
  }

  private evaluateConditions(conditions: Record<string, any>, context: Record<string, any>): boolean {
    for (const [key, expectedValue] of Object.entries(conditions)) {
      const contextValue = this.getNestedValue(context, key)

      if (Array.isArray(expectedValue)) {
        if (!expectedValue.includes(contextValue)) {
          return false
        }
      } else if (typeof expectedValue === 'object' && expectedValue !== null) {
        // Complex condition evaluation (ranges, comparisons)
        if (!this.evaluateComplexCondition(contextValue, expectedValue)) {
          return false
        }
      } else if (contextValue !== expectedValue) {
        return false
      }
    }

    return true
  }

  private evaluateComplexCondition(value: any, condition: any): boolean {
    if (condition.min !== undefined && value < condition.min) return false
    if (condition.max !== undefined && value > condition.max) return false
    if (condition.in && !condition.in.includes(value)) return false
    if (condition.regex && !new RegExp(condition.regex).test(value)) return false

    return true
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj)
  }

  private isValidCache(cacheKey: string): boolean {
    const expiry = this.cacheExpiry.get(cacheKey)
    return expiry ? Date.now() < expiry : false
  }

  invalidateCache(userId?: string, tenantId?: string): void {
    if (userId && tenantId) {
      const cacheKey = `${userId}:${tenantId}`
      this.cache.delete(cacheKey)
      this.cacheExpiry.delete(cacheKey)
    } else {
      // Clear all cache
      this.cache.clear()
      this.cacheExpiry.clear()
    }
  }
}

export const permissionService = new PermissionService()
```

### 2. Permission Hooks and Middleware

```typescript
// hooks/use-permissions.ts
import { useSession } from 'next-auth/react'
import { useTenant } from './use-tenant'
import { useQuery } from '@tanstack/react-query'
import { permissionService } from '@/lib/auth/permissions'

export function usePermissions() {
  const { data: session } = useSession()
  const tenant = useTenant()

  const { data: permissions, isLoading } = useQuery({
    queryKey: ['permissions', session?.user?.id, tenant?.id],
    queryFn: () => {
      if (!session?.user?.id) return []
      return permissionService.getUserPermissions(session.user.id, tenant?.id)
    },
    enabled: !!session?.user?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  const hasPermission = (
    resourceType: string,
    action: string,
    resourceId?: string,
    context?: Record<string, any>
  ) => {
    if (!session?.user?.id || !tenant?.id) return false

    return permissions?.some(permission =>
      permissionService['matchesPermission'](
        permission,
        resourceType,
        action,
        resourceId,
        context
      )
    ) || false
  }

  const hasAnyPermission = (checks: Array<{
    resourceType: string
    action: string
    resourceId?: string
    context?: Record<string, any>
  }>) => {
    return checks.some(check => hasPermission(
      check.resourceType,
      check.action,
      check.resourceId,
      check.context
    ))
  }

  const hasAllPermissions = (checks: Array<{
    resourceType: string
    action: string
    resourceId?: string
    context?: Record<string, any>
  }>) => {
    return checks.every(check => hasPermission(
      check.resourceType,
      check.action,
      check.resourceId,
      check.context
    ))
  }

  return {
    permissions: permissions || [],
    isLoading,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions
  }
}

// Higher-order component for permission-based access
export function withPermission<P extends object>(
  Component: React.ComponentType<P>,
  requiredPermission: {
    resourceType: string
    action: string
    resourceId?: string
    context?: Record<string, any>
  }
) {
  return function PermissionWrappedComponent(props: P) {
    const { hasPermission, isLoading } = usePermissions()

    if (isLoading) {
      return <div>Loading permissions...</div>
    }

    if (!hasPermission(
      requiredPermission.resourceType,
      requiredPermission.action,
      requiredPermission.resourceId,
      requiredPermission.context
    )) {
      return <div>Access denied</div>
    }

    return <Component {...props} />
  }
}

// Permission guard component
export function PermissionGuard({
  children,
  resourceType,
  action,
  resourceId,
  context,
  fallback
}: {
  children: React.ReactNode
  resourceType: string
  action: string
  resourceId?: string
  context?: Record<string, any>
  fallback?: React.ReactNode
}) {
  const { hasPermission, isLoading } = usePermissions()

  if (isLoading) {
    return <div>Loading...</div>
  }

  if (!hasPermission(resourceType, action, resourceId, context)) {
    return fallback || null
  }

  return <>{children}</>
}
```

### 3. API Route Protection

```typescript
// lib/auth/api-protection.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { permissionService } from './permissions'
import { getTenantContext } from '@/lib/tenant/middleware'

export interface ProtectionOptions {
  resourceType: string
  action: string
  getResourceId?: (request: NextRequest) => Promise<string | undefined>
  getContext?: (request: NextRequest) => Promise<Record<string, any> | undefined>
}

export function withPermission(options: ProtectionOptions) {
  return function (handler: (request: NextRequest, context: any) => Promise<Response>) {
    return async function protectedHandler(request: NextRequest, context: any): Promise<Response> {
      try {
        const session = await auth()
        if (!session?.user) {
          return NextResponse.json(
            { error: 'Authentication required' },
            { status: 401 }
          )
        }

        const tenant = await getTenantContext(request)
        if (!tenant) {
          return NextResponse.json(
            { error: 'Tenant context required' },
            { status: 400 }
          )
        }

        const resourceId = options.getResourceId
          ? await options.getResourceId(request)
          : undefined

        const permissionContext = options.getContext
          ? await options.getContext(request)
          : undefined

        const hasPermission = await permissionService.checkPermission(
          session.user.id,
          tenant.id,
          options.resourceType,
          options.action,
          resourceId,
          permissionContext
        )

        if (!hasPermission) {
          return NextResponse.json(
            { error: 'Insufficient permissions' },
            { status: 403 }
          )
        }

        return await handler(request, context)

      } catch (error) {
        console.error('Permission check error:', error)
        return NextResponse.json(
          { error: 'Internal server error' },
          { status: 500 }
        )
      }
    }
  }
}

// Usage example
export const GET = withPermission({
  resourceType: 'warehouses',
  action: 'read',
  getResourceId: async (request) => {
    const url = new URL(request.url)
    return url.pathname.split('/').pop()
  },
  getContext: async (request) => {
    const tenant = await getTenantContext(request)
    return {
      tenantId: tenant?.id,
      userAgent: request.headers.get('user-agent')
    }
  }
})(async function handler(request: NextRequest) {
  // Protected route logic here
  return NextResponse.json({ data: 'warehouse data' })
})
```

## Performance Optimization

### 1. Permission Caching Strategy

```typescript
// lib/auth/permission-cache.ts
import Redis from 'ioredis'

export class PermissionCache {
  private redis: Redis
  private defaultTTL = 300 // 5 minutes

  constructor() {
    this.redis = new Redis(process.env.REDIS_URL!)
  }

  private getKey(userId: string, tenantId?: string): string {
    return `permissions:${userId}:${tenantId || 'global'}`
  }

  async get(userId: string, tenantId?: string): Promise<Permission[] | null> {
    try {
      const cached = await this.redis.get(this.getKey(userId, tenantId))
      return cached ? JSON.parse(cached) : null
    } catch (error) {
      console.error('Cache get error:', error)
      return null
    }
  }

  async set(
    userId: string,
    tenantId: string | undefined,
    permissions: Permission[],
    ttl = this.defaultTTL
  ): Promise<void> {
    try {
      await this.redis.setex(
        this.getKey(userId, tenantId),
        ttl,
        JSON.stringify(permissions)
      )
    } catch (error) {
      console.error('Cache set error:', error)
    }
  }

  async invalidate(userId: string, tenantId?: string): Promise<void> {
    try {
      if (tenantId) {
        await this.redis.del(this.getKey(userId, tenantId))
      } else {
        // Invalidate all user permissions
        const keys = await this.redis.keys(`permissions:${userId}:*`)
        if (keys.length > 0) {
          await this.redis.del(...keys)
        }
      }
    } catch (error) {
      console.error('Cache invalidation error:', error)
    }
  }

  async invalidateTenant(tenantId: string): Promise<void> {
    try {
      const keys = await this.redis.keys(`permissions:*:${tenantId}`)
      if (keys.length > 0) {
        await this.redis.del(...keys)
      }
    } catch (error) {
      console.error('Tenant cache invalidation error:', error)
    }
  }
}

export const permissionCache = new PermissionCache()
```

### 2. Database Indexing Strategy

```sql
-- High-performance indexes for permission checking
CREATE INDEX CONCURRENTLY idx_user_roles_user_tenant_active
ON platform.user_roles(user_id, tenant_id, is_active, expires_at)
WHERE is_active = true;

CREATE INDEX CONCURRENTLY idx_user_roles_tenant_role
ON platform.user_roles(tenant_id, role_id)
WHERE is_active = true;

CREATE INDEX CONCURRENTLY idx_resource_permissions_user_tenant_type
ON platform.resource_permissions(user_id, tenant_id, resource_type, resource_id);

CREATE INDEX CONCURRENTLY idx_roles_scope_level
ON platform.roles(scope, level)
WHERE scope IN ('global', 'tenant');

-- Partial indexes for active permissions only
CREATE INDEX CONCURRENTLY idx_user_roles_active_unexpired
ON platform.user_roles(user_id, tenant_id, role_id)
WHERE is_active = true AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP);

-- Covering index for permission cache materialized view
CREATE INDEX CONCURRENTLY idx_user_permissions_cache_covering
ON platform.user_permissions_cache(user_id, tenant_id)
INCLUDE (role_name, role_level, permissions, conditions);
```

## Security Considerations

### 1. Permission Injection Prevention

```typescript
// Validate permission parameters
function validatePermissionParams(
  resourceType: string,
  action: string,
  resourceId?: string
): void {
  const validResourceTypes = [
    'warehouses', 'inventory', 'orders', 'users', 'reports'
  ]
  const validActions = [
    'create', 'read', 'update', 'delete', 'manage'
  ]

  if (!validResourceTypes.includes(resourceType)) {
    throw new Error(`Invalid resource type: ${resourceType}`)
  }

  if (!validActions.includes(action)) {
    throw new Error(`Invalid action: ${action}`)
  }

  if (resourceId && !isValidUUID(resourceId)) {
    throw new Error(`Invalid resource ID format: ${resourceId}`)
  }
}

// Prevent privilege escalation
async function validateRoleAssignment(
  assignerId: string,
  targetUserId: string,
  roleId: string,
  tenantId: string
): Promise<void> {
  const assignerRoles = await getUserRoles(assignerId, tenantId)
  const targetRole = await getRoleById(roleId)

  // Check if assigner can grant this role
  const canGrant = assignerRoles.some(role =>
    role.level <= targetRole.level &&
    role.permissions.users?.includes('manage')
  )

  if (!canGrant) {
    throw new Error('Insufficient privileges to assign this role')
  }

  // Prevent self-privilege escalation
  if (assignerId === targetUserId) {
    const currentHighestLevel = Math.min(...assignerRoles.map(r => r.level))
    if (targetRole.level < currentHighestLevel) {
      throw new Error('Cannot elevate own privileges')
    }
  }
}
```

### 2. Audit and Compliance

```typescript
// Comprehensive audit logging
async function auditPermissionChange(
  action: 'grant' | 'revoke' | 'update',
  performedBy: string,
  targetUser: string,
  tenantId: string,
  changes: {
    resourceType?: string
    resourceId?: string
    oldPermissions?: string[]
    newPermissions?: string[]
    roleId?: string
  },
  reason?: string
): Promise<void> {
  await prisma.permissionAudit.create({
    data: {
      userId: targetUser,
      tenantId,
      action,
      resourceType: changes.resourceType,
      resourceId: changes.resourceId,
      oldPermissions: changes.oldPermissions ? {
        permissions: changes.oldPermissions
      } : undefined,
      newPermissions: changes.newPermissions ? {
        permissions: changes.newPermissions
      } : undefined,
      performedBy,
      reason,
      ipAddress: await getCurrentIP(),
      userAgent: await getCurrentUserAgent(),
      createdAt: new Date()
    }
  })

  // Real-time security monitoring
  await monitorSecurityEvent({
    type: 'permission_change',
    severity: action === 'grant' ? 'medium' : 'high',
    details: {
      action,
      performedBy,
      targetUser,
      tenantId,
      changes
    }
  })
}
```

## Migration Strategy

### Phase 1: Core RBAC (Week 1-2)
```sql
-- Create core tables
-- Insert system roles
-- Basic permission checking functions
```

### Phase 2: Tenant Integration (Week 3)
```sql
-- Add tenant-specific roles
-- Implement tenant isolation
-- Migration from simple roles
```

### Phase 3: Advanced Features (Week 4-5)
```sql
-- Resource-specific permissions
-- Attribute-based conditions
-- Performance optimization
```

### Phase 4: Production (Week 6)
```sql
-- Security audit
-- Performance testing
-- Monitoring setup
```

## Success Metrics

### Performance Targets
- **Permission Check Latency**: < 10ms p95
- **Role Assignment**: < 100ms p95
- **Cache Hit Ratio**: > 95%
- **Database Query Performance**: < 5ms per check

### Security Metrics
- **Zero Privilege Escalations**: 100% prevention
- **Audit Coverage**: 100% permission changes logged
- **Access Denial Rate**: < 0.1% false positives

### Operational Metrics
- **Permission Management Efficiency**: 50% reduction in manual effort
- **Role Maintenance**: Automated 90% of routine tasks
- **Compliance Readiness**: 100% audit trail completeness

## Future Enhancements

### 1. Machine Learning Integration
- **Anomaly Detection**: Unusual permission patterns
- **Intelligent Suggestions**: Role optimization recommendations
- **Risk Assessment**: Dynamic permission risk scoring

### 2. Advanced ABAC Features
- **Time-based Permissions**: Working hours restrictions
- **Location-based Access**: Geographic access control
- **Device-based Permissions**: Device trust scoring

### 3. External Integration
- **Identity Providers**: SAML/OIDC role mapping
- **Compliance Frameworks**: SOC2/GDPR automation
- **External Auditing**: Third-party compliance tools

## Conclusion

The hybrid RBAC design provides enterprise-grade access control with the flexibility to handle complex business scenarios while maintaining optimal performance and security standards for the Skidspace platform.

**Decision Confidence**: High (95%)
**Implementation Complexity**: Medium-High
**Review Date**: 2026-06-23 (3-month review)