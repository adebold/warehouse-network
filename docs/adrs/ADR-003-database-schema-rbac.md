# ADR-003: Database Schema Design for RBAC

## Status
Accepted

## Date
2026-03-23

## Context

The warehouse network platform requires a sophisticated Role-Based Access Control (RBAC) system that supports:
- **Hierarchical Roles**: Super Admin → Warehouse Admin → Partner → Customer
- **Cross-Tenant Permissions**: Partners accessing multiple warehouses
- **Dynamic Permission Assignment**: Runtime permission changes
- **Attribute-Based Controls**: Location, time, and context-sensitive permissions
- **Audit Requirements**: Complete audit trail for compliance

### RBAC Models Considered

1. **Flat RBAC**: Simple role-permission mapping
   - Pros: Easy to implement and understand
   - Cons: Limited hierarchy, role explosion

2. **Hierarchical RBAC**: Role inheritance structure
   - Pros: Efficient permission inheritance, scalable
   - Cons: Complex permission resolution, potential conflicts

3. **Attribute-Based Access Control (ABAC)**: Dynamic policy-driven
   - Pros: Highly flexible, context-aware
   - Cons: Performance overhead, complex policy management

4. **Hybrid RBAC + ABAC**: Core roles with attribute modifiers
   - Pros: Balance of simplicity and flexibility
   - Cons: Increased complexity, careful design required

## Decision

**Selected: Hierarchical RBAC with Attribute Extensions**

## Rationale

### Core Schema Design:

```sql
-- ========================================
-- RBAC CORE SCHEMA
-- ========================================

-- Tenants (from core schema)
CREATE TABLE core.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subdomain VARCHAR(63) UNIQUE NOT NULL,
    plan_tier VARCHAR(50) NOT NULL CHECK (plan_tier IN ('basic', 'professional', 'enterprise')),
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    config JSONB DEFAULT '{}'
);

-- Role Definitions (Global + Tenant-specific)
CREATE TABLE core.roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES core.tenants(id) NULL, -- NULL for global roles
    name VARCHAR(100) NOT NULL,
    description TEXT,
    level INTEGER NOT NULL, -- Hierarchy level (0=highest)
    parent_role_id UUID REFERENCES core.roles(id) NULL,
    is_system_role BOOLEAN DEFAULT false,
    permissions JSONB NOT NULL DEFAULT '[]',
    attributes JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(tenant_id, name),
    CHECK (level >= 0 AND level <= 10)
);

-- System Roles (Seeded Data)
INSERT INTO core.roles (id, name, description, level, permissions, is_system_role) VALUES
('00000000-0000-0000-0000-000000000001', 'super_admin', 'Platform Super Administrator', 0,
 '["platform:*", "tenant:*", "user:*", "warehouse:*", "inventory:*", "order:*", "analytics:*"]', true),

('00000000-0000-0000-0000-000000000002', 'warehouse_admin', 'Warehouse Administrator', 1,
 '["tenant:read", "warehouse:*", "inventory:*", "order:*", "user:manage", "analytics:read"]', true),

('00000000-0000-0000-0000-000000000003', 'partner', 'Business Partner', 2,
 '["warehouse:read", "inventory:read", "order:create", "order:read", "analytics:read"]', true),

('00000000-0000-0000-0000-000000000004', 'customer', 'End Customer', 3,
 '["order:create", "order:read:own", "inventory:read:available"]', true);

-- User Role Assignments
CREATE TABLE core.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL, -- References core.users(id)
    role_id UUID REFERENCES core.roles(id) NOT NULL,
    tenant_id UUID REFERENCES core.tenants(id), -- Scope for role
    granted_by UUID NOT NULL, -- References core.users(id)
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NULL,
    attributes JSONB DEFAULT '{}', -- Role-specific attributes
    is_active BOOLEAN DEFAULT true,

    UNIQUE(user_id, role_id, tenant_id)
);

-- Permission Templates
CREATE TABLE core.permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource VARCHAR(50) NOT NULL, -- e.g., 'warehouse', 'inventory'
    action VARCHAR(50) NOT NULL,   -- e.g., 'create', 'read', 'update'
    scope VARCHAR(50) DEFAULT '*', -- e.g., 'own', 'tenant', 'all'
    description TEXT,
    attributes_required JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(resource, action, scope)
);

-- Permission Auditing
CREATE TABLE core.permission_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    resource VARCHAR(50) NOT NULL,
    action VARCHAR(50) NOT NULL,
    scope VARCHAR(50) NOT NULL,
    permission_granted BOOLEAN NOT NULL,
    denial_reason TEXT NULL,
    context JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) PARTITION BY RANGE (created_at);

-- Create monthly partitions
CREATE TABLE core.permission_audits_2026_03 PARTITION OF core.permission_audits
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
```

### Tenant-Specific Extensions:

```sql
-- ========================================
-- TENANT-SPECIFIC RBAC EXTENSIONS
-- ========================================

-- Warehouse-Specific Role Assignments
CREATE TABLE tenant_{tenant_id}.warehouse_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    warehouse_id UUID REFERENCES tenant_{tenant_id}.warehouses(id),
    role_id UUID REFERENCES core.roles(id),
    permissions_override JSONB DEFAULT '{}', -- Override specific permissions
    location_restrictions JSONB DEFAULT '[]', -- Specific zones/areas
    time_restrictions JSONB DEFAULT '{}', -- Working hours, etc.
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(user_id, warehouse_id, role_id)
);

-- Dynamic Permission Policies
CREATE TABLE tenant_{tenant_id}.permission_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    conditions JSONB NOT NULL, -- ABAC conditions
    permissions JSONB NOT NULL,
    priority INTEGER DEFAULT 1000,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Example Permission Policies
INSERT INTO tenant_{tenant_id}.permission_policies (name, conditions, permissions) VALUES
('Peak Hours Restriction',
 '{"time": {"between": ["18:00", "06:00"]}, "role": "partner"}',
 '{"inventory:update": "deny", "order:create": "allow"}'),

('High Value Items',
 '{"item_value": {"gt": 10000}, "location": "secure_zone"}',
 '{"inventory:access": "require_approval"}'),

('Emergency Override',
 '{"emergency_mode": true, "role": "warehouse_admin"}',
 '{"warehouse:*": "allow", "audit:required": true}');
```

### Permission Resolution Engine:

```typescript
interface PermissionContext {
  userId: string;
  tenantId: string;
  warehouseId?: string;
  resource: string;
  action: string;
  attributes?: Record<string, any>;
  timestamp?: Date;
  location?: string;
  ipAddress?: string;
}

class RBACEngine {
  async checkPermission(context: PermissionContext): Promise<PermissionResult> {
    try {
      // 1. Get user's roles in order of hierarchy
      const userRoles = await this.getUserRoles(context);

      // 2. Check role-based permissions
      const rolePermissions = await this.resolveRolePermissions(userRoles);

      // 3. Apply warehouse-specific overrides
      const warehouseOverrides = await this.getWarehouseOverrides(context);

      // 4. Evaluate dynamic policies (ABAC)
      const policyEvaluations = await this.evaluatePolicies(context);

      // 5. Combine all results with precedence
      const result = this.combinePermissions({
        rolePermissions,
        warehouseOverrides,
        policyEvaluations,
        context
      });

      // 6. Audit the decision
      await this.auditPermissionCheck(context, result);

      return result;
    } catch (error) {
      // Default to deny on error
      return { granted: false, reason: 'System error during permission check' };
    }
  }

  private async resolveRolePermissions(
    roles: UserRole[]
  ): Promise<PermissionSet> {
    const permissions = new Set<string>();

    // Process roles by hierarchy (lowest level first for inheritance)
    const sortedRoles = roles.sort((a, b) => a.level - b.level);

    for (const role of sortedRoles) {
      // Add role's direct permissions
      role.permissions.forEach(perm => permissions.add(perm));

      // Add inherited permissions from parent roles
      const inheritedPerms = await this.getInheritedPermissions(role);
      inheritedPerms.forEach(perm => permissions.add(perm));
    }

    return { permissions: Array.from(permissions) };
  }

  private async evaluatePolicies(
    context: PermissionContext
  ): Promise<PolicyResult[]> {
    const policies = await this.getActivePolicies(context.tenantId);
    const results: PolicyResult[] = [];

    for (const policy of policies) {
      try {
        const evaluation = await this.evaluateConditions(
          policy.conditions,
          context
        );

        if (evaluation.matches) {
          results.push({
            policyId: policy.id,
            effect: policy.permissions[`${context.resource}:${context.action}`],
            priority: policy.priority,
            conditions: evaluation.satisfiedConditions
          });
        }
      } catch (error) {
        // Log policy evaluation error but continue
        console.error(`Policy evaluation error: ${policy.id}`, error);
      }
    }

    return results.sort((a, b) => a.priority - b.priority); // Higher priority first
  }
}
```

### Advanced Features:

#### 1. Role Hierarchy with Constraints:
```sql
-- Role Inheritance with Constraints
CREATE OR REPLACE FUNCTION check_role_hierarchy()
RETURNS TRIGGER AS $$
BEGIN
  -- Prevent circular inheritance
  IF EXISTS (
    WITH RECURSIVE role_hierarchy AS (
      SELECT parent_role_id, id, 1 as depth
      FROM core.roles
      WHERE id = NEW.parent_role_id

      UNION ALL

      SELECT r.parent_role_id, r.id, rh.depth + 1
      FROM core.roles r
      JOIN role_hierarchy rh ON r.id = rh.parent_role_id
      WHERE rh.depth < 10
    )
    SELECT 1 FROM role_hierarchy WHERE id = NEW.id
  ) THEN
    RAISE EXCEPTION 'Circular role inheritance detected';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER role_hierarchy_check
  BEFORE INSERT OR UPDATE ON core.roles
  FOR EACH ROW EXECUTE FUNCTION check_role_hierarchy();
```

#### 2. Dynamic Permission Caching:
```typescript
class PermissionCache {
  private redis: RedisClient;

  async cacheUserPermissions(
    userId: string,
    tenantId: string,
    permissions: PermissionSet
  ): Promise<void> {
    const key = `permissions:${tenantId}:${userId}`;
    await this.redis.setex(
      key,
      300, // 5 minutes TTL
      JSON.stringify(permissions)
    );
  }

  async invalidateUserCache(userId: string, tenantId?: string): Promise<void> {
    const pattern = tenantId
      ? `permissions:${tenantId}:${userId}`
      : `permissions:*:${userId}`;

    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}
```

## Consequences

### Positive:
- **Scalable Hierarchy**: Clear role inheritance with override capabilities
- **Flexible Policies**: ABAC attributes for context-sensitive permissions
- **Audit Compliance**: Complete permission audit trail
- **Performance**: Cached permission resolution with 50ms response time
- **Multi-tenant Safe**: Isolated role assignments per tenant

### Negative:
- **Complexity**: Multiple layers of permission resolution
- **Cache Invalidation**: Careful coordination required for permission changes
- **Migration Overhead**: Existing users need role mapping
- **Policy Conflicts**: Potential for conflicting attribute-based policies

### Risk Mitigation:

#### Permission Conflict Resolution:
```sql
-- Policy Conflict Resolution Rules
CREATE TABLE core.conflict_resolution_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_type VARCHAR(50) NOT NULL, -- 'deny_overrides', 'permit_overrides', 'highest_priority'
    resource_pattern VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Default rule: Explicit deny overrides permit
INSERT INTO core.conflict_resolution_rules (rule_type, resource_pattern, description)
VALUES ('deny_overrides', '*', 'Explicit deny always overrides permit');
```

## Implementation Plan

### Phase 1: Core RBAC (Week 1-2)
- Implement base role and permission tables
- Create permission resolution engine
- Basic role hierarchy support

### Phase 2: Tenant Integration (Week 3)
- Tenant-specific role extensions
- Warehouse-level permission overrides
- Multi-tenant role isolation

### Phase 3: ABAC Features (Week 4-5)
- Dynamic policy engine
- Attribute-based conditions
- Time and location-based permissions

### Phase 4: Optimization (Week 6)
- Permission caching layer
- Performance optimization
- Audit system integration

## Related ADRs
- ADR-001: Authentication Provider Selection
- ADR-002: Multi-tenant Architecture Pattern
- ADR-004: Session Management Strategy
- ADR-005: API Security Implementation