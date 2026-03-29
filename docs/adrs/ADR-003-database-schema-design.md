# ADR-003: Database Schema Design for Authentication & RBAC

**Status**: Proposed
**Date**: 2026-03-23
**Deciders**: Swarm Architecture Team
**Technical Story**: Design comprehensive database schema for authentication and role-based access control

## Context and Problem Statement

The skidspace.com platform requires a robust database schema that supports:
- Multi-tenant authentication with NextAuth.js
- Role-based access control (RBAC) with granular permissions
- Persona-based user management
- Audit trails for security compliance
- Scalable performance for growing user base

We need to design a schema that integrates seamlessly with NextAuth.js while providing the flexibility for complex authorization scenarios.

## Decision Drivers

- **NextAuth.js Compatibility**: Must work with NextAuth.js adapter requirements
- **Performance**: Fast authentication and authorization queries
- **Flexibility**: Support complex role hierarchies and permissions
- **Security**: Prevent privilege escalation and ensure audit trails
- **Scalability**: Handle large numbers of users, roles, and permissions
- **Multi-tenancy**: Complete tenant isolation with shared authentication infrastructure
- **Compliance**: Support for audit logs and data retention policies

## Considered Options

### Option 1: Flat Role Model
- Simple roles table with direct user-role mapping
- Permissions embedded as JSON in roles
- Minimal database overhead

### Option 2: Hierarchical RBAC Model
- Roles can inherit from parent roles
- Separate permissions table with role-permission mapping
- Support for role hierarchies

### Option 3: Attribute-Based Access Control (ABAC)
- Policy-based access control with attributes
- Dynamic permission evaluation
- Maximum flexibility but complex implementation

### Option 4: Hybrid RBAC with Persona Extensions
- Traditional RBAC with persona-specific overlays
- Context-aware permissions based on user persona
- Combines simplicity with flexibility

## Decision Outcome

**Chosen Option**: **Option 4 - Hybrid RBAC with Persona Extensions**

This approach provides the best balance of flexibility, performance, and maintainability while supporting our persona-based SaaS requirements.

## Database Schema Design

### Core Authentication Tables (NextAuth.js Compatible)

```sql
-- NextAuth.js core tables
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  type VARCHAR(255) NOT NULL,
  provider VARCHAR(255) NOT NULL,
  provider_account_id VARCHAR(255) NOT NULL,
  refresh_token TEXT,
  access_token TEXT,
  expires_at BIGINT,
  token_type VARCHAR(255),
  scope VARCHAR(255),
  id_token TEXT,
  session_state VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(provider, provider_account_id)
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token VARCHAR(255) UNIQUE NOT NULL,
  user_id UUID NOT NULL,
  expires TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255),
  email VARCHAR(255) UNIQUE,
  email_verified TIMESTAMPTZ,
  image VARCHAR(255),

  -- Extended fields for our platform
  tenant_id UUID NOT NULL,
  status VARCHAR(50) DEFAULT 'active',
  last_login TIMESTAMPTZ,
  login_count INTEGER DEFAULT 0,
  preferences JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  FOREIGN KEY (tenant_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE TABLE verification_tokens (
  identifier VARCHAR(255) NOT NULL,
  token VARCHAR(255) UNIQUE NOT NULL,
  expires TIMESTAMPTZ NOT NULL,

  PRIMARY KEY (identifier, token)
);
```

### Multi-Tenant Organization Structure

```sql
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  domain VARCHAR(255),
  logo_url VARCHAR(255),

  -- Tenant configuration
  plan_type VARCHAR(50) DEFAULT 'basic',
  status VARCHAR(50) DEFAULT 'active',
  settings JSONB DEFAULT '{}',
  features JSONB DEFAULT '[]',
  limits JSONB DEFAULT '{}',

  -- Billing information
  billing_email VARCHAR(255),
  billing_address JSONB,
  subscription_id VARCHAR(255),
  subscription_status VARCHAR(50),
  trial_ends_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Organization membership with roles
CREATE TABLE organization_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  role VARCHAR(100) NOT NULL DEFAULT 'member',
  status VARCHAR(50) DEFAULT 'active',
  invited_by UUID,
  invited_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ DEFAULT NOW(),

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE SET NULL,

  UNIQUE(user_id, organization_id)
);
```

### Role-Based Access Control System

```sql
-- Core roles table
CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,  -- NULL for global roles, specific for tenant roles
  name VARCHAR(100) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Role hierarchy
  parent_role_id UUID,
  level INTEGER DEFAULT 0,

  -- Role metadata
  is_system_role BOOLEAN DEFAULT false,
  is_assignable BOOLEAN DEFAULT true,
  color VARCHAR(7), -- Hex color for UI

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  FOREIGN KEY (tenant_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_role_id) REFERENCES roles(id) ON DELETE SET NULL,

  UNIQUE(tenant_id, name)
);

-- Permissions table
CREATE TABLE permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  display_name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),

  -- Permission metadata
  resource_type VARCHAR(100),
  action VARCHAR(100),
  scope VARCHAR(100) DEFAULT 'tenant', -- global, tenant, resource

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Role-Permission mapping
CREATE TABLE role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL,
  permission_id UUID NOT NULL,
  granted BOOLEAN DEFAULT true,
  conditions JSONB, -- Additional conditions for the permission

  created_at TIMESTAMPTZ DEFAULT NOW(),

  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE,

  UNIQUE(role_id, permission_id)
);

-- User-Role assignments
CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role_id UUID NOT NULL,
  tenant_id UUID NOT NULL,

  -- Assignment metadata
  assigned_by UUID,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  conditions JSONB, -- Additional conditions for role assignment

  -- Context information
  context VARCHAR(100), -- 'direct', 'inherited', 'temporary'
  resource_id UUID, -- For resource-specific role assignments

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL,

  UNIQUE(user_id, role_id, tenant_id, resource_id)
);
```

### Persona Management System

```sql
-- Persona definitions
CREATE TABLE personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,  -- NULL for global personas
  name VARCHAR(100) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Persona configuration
  default_role_id UUID,
  ui_config JSONB DEFAULT '{}',
  features JSONB DEFAULT '[]',
  permissions_override JSONB DEFAULT '{}',

  -- Persona metadata
  color VARCHAR(7),
  icon VARCHAR(100),
  is_system_persona BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  FOREIGN KEY (tenant_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (default_role_id) REFERENCES roles(id) ON DELETE SET NULL,

  UNIQUE(tenant_id, name)
);

-- User-Persona assignments
CREATE TABLE user_personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  persona_id UUID NOT NULL,
  tenant_id UUID NOT NULL,

  -- Assignment metadata
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  assigned_by UUID,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (persona_id) REFERENCES personas(id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL,

  UNIQUE(user_id, persona_id, tenant_id)
);

-- User session context (tracks active persona)
CREATE TABLE user_session_contexts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token VARCHAR(255) NOT NULL,
  user_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  active_persona_id UUID,

  -- Context metadata
  ip_address INET,
  user_agent TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (active_persona_id) REFERENCES personas(id) ON DELETE SET NULL,

  UNIQUE(session_token)
);
```

### Audit and Security Tables

```sql
-- Audit log for security events
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  user_id UUID,
  session_token VARCHAR(255),

  -- Event details
  event_type VARCHAR(100) NOT NULL,
  event_category VARCHAR(50) NOT NULL, -- auth, rbac, data, system
  resource_type VARCHAR(100),
  resource_id VARCHAR(255),

  -- Event data
  event_data JSONB DEFAULT '{}',
  old_values JSONB,
  new_values JSONB,

  -- Request context
  ip_address INET,
  user_agent TEXT,
  request_id VARCHAR(255),

  -- Event metadata
  severity VARCHAR(20) DEFAULT 'info', -- debug, info, warn, error, critical
  status VARCHAR(20) DEFAULT 'success', -- success, failure, pending

  created_at TIMESTAMPTZ DEFAULT NOW(),

  FOREIGN KEY (tenant_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Security events and violations
CREATE TABLE security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  user_id UUID,

  -- Event classification
  event_type VARCHAR(100) NOT NULL,
  severity VARCHAR(20) NOT NULL, -- low, medium, high, critical
  status VARCHAR(20) DEFAULT 'detected', -- detected, investigating, resolved

  -- Event details
  description TEXT NOT NULL,
  details JSONB DEFAULT '{}',

  -- Source information
  source_ip INET,
  user_agent TEXT,
  endpoint VARCHAR(255),

  -- Response information
  blocked BOOLEAN DEFAULT false,
  action_taken VARCHAR(255),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,

  FOREIGN KEY (tenant_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
```

### Indexes and Performance Optimization

```sql
-- Core authentication indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_tenant_id ON users(tenant_id);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_token ON sessions(session_token);
CREATE INDEX idx_accounts_user_id ON accounts(user_id);
CREATE INDEX idx_accounts_provider ON accounts(provider, provider_account_id);

-- RBAC indexes
CREATE INDEX idx_roles_tenant_id ON roles(tenant_id);
CREATE INDEX idx_roles_parent ON roles(parent_role_id);
CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX idx_user_roles_role_id ON user_roles(role_id);
CREATE INDEX idx_user_roles_tenant_id ON user_roles(tenant_id);
CREATE INDEX idx_role_permissions_role ON role_permissions(role_id);

-- Persona indexes
CREATE INDEX idx_personas_tenant_id ON personas(tenant_id);
CREATE INDEX idx_user_personas_user_id ON user_personas(user_id);
CREATE INDEX idx_user_personas_persona_id ON user_personas(persona_id);
CREATE INDEX idx_session_contexts_session ON user_session_contexts(session_token);
CREATE INDEX idx_session_contexts_user ON user_session_contexts(user_id);

-- Audit indexes
CREATE INDEX idx_audit_logs_tenant_id ON audit_logs(tenant_id);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX idx_security_events_tenant_id ON security_events(tenant_id);
CREATE INDEX idx_security_events_severity ON security_events(severity);
CREATE INDEX idx_security_events_created_at ON security_events(created_at);
```

### Row Level Security (RLS) Policies

```sql
-- Enable RLS on all tenant-aware tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Users can only see users from their tenant
CREATE POLICY tenant_isolation_users ON users
  FOR ALL
  TO authenticated_user
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- Role assignments are tenant-scoped
CREATE POLICY tenant_isolation_user_roles ON user_roles
  FOR ALL
  TO authenticated_user
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- Persona assignments are tenant-scoped
CREATE POLICY tenant_isolation_user_personas ON user_personas
  FOR ALL
  TO authenticated_user
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- Audit logs are tenant-scoped
CREATE POLICY tenant_isolation_audit_logs ON audit_logs
  FOR SELECT
  TO authenticated_user
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
```

## Prisma Schema

```prisma
model Organization {
  id                String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name              String
  slug              String    @unique
  domain            String?
  logoUrl           String?   @map("logo_url")
  planType          String    @default("basic") @map("plan_type")
  status            String    @default("active")
  settings          Json      @default("{}")
  features          Json      @default("[]")
  limits            Json      @default("{}")
  billingEmail      String?   @map("billing_email")
  billingAddress    Json?     @map("billing_address")
  subscriptionId    String?   @map("subscription_id")
  subscriptionStatus String? @map("subscription_status")
  trialEndsAt       DateTime? @map("trial_ends_at")
  createdAt         DateTime  @default(now()) @map("created_at")
  updatedAt         DateTime  @updatedAt @map("updated_at")

  users             User[]
  roles             Role[]
  personas          Persona[]
  auditLogs         AuditLog[]
  securityEvents    SecurityEvent[]
  memberships       OrganizationMembership[]

  @@map("organizations")
}

model User {
  id               String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name             String?
  email            String    @unique
  emailVerified    DateTime? @map("email_verified")
  image            String?
  tenantId         String    @map("tenant_id") @db.Uuid
  status           String    @default("active")
  lastLogin        DateTime? @map("last_login")
  loginCount       Int       @default(0) @map("login_count")
  preferences      Json      @default("{}")
  metadata         Json      @default("{}")
  createdAt        DateTime  @default(now()) @map("created_at")
  updatedAt        DateTime  @updatedAt @map("updated_at")

  organization     Organization @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  accounts         Account[]
  sessions         Session[]
  roles            UserRole[]
  personas         UserPersona[]
  sessionContexts  UserSessionContext[]
  auditLogs        AuditLog[]
  memberships      OrganizationMembership[]

  @@map("users")
}

model Role {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId       String?   @map("tenant_id") @db.Uuid
  name           String
  displayName    String    @map("display_name")
  description    String?
  parentRoleId   String?   @map("parent_role_id") @db.Uuid
  level          Int       @default(0)
  isSystemRole   Boolean   @default(false) @map("is_system_role")
  isAssignable   Boolean   @default(true) @map("is_assignable")
  color          String?
  createdAt      DateTime  @default(now()) @map("created_at")
  updatedAt      DateTime  @updatedAt @map("updated_at")

  organization   Organization? @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  parentRole     Role?         @relation("RoleHierarchy", fields: [parentRoleId], references: [id])
  childRoles     Role[]        @relation("RoleHierarchy")
  permissions    RolePermission[]
  userRoles      UserRole[]

  @@unique([tenantId, name])
  @@map("roles")
}

model Permission {
  id           String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name         String    @unique
  displayName  String    @map("display_name")
  description  String?
  category     String?
  resourceType String?   @map("resource_type")
  action       String?
  scope        String    @default("tenant")
  createdAt    DateTime  @default(now()) @map("created_at")

  rolePermissions RolePermission[]

  @@map("permissions")
}

model RolePermission {
  id           String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  roleId       String    @map("role_id") @db.Uuid
  permissionId String    @map("permission_id") @db.Uuid
  granted      Boolean   @default(true)
  conditions   Json?
  createdAt    DateTime  @default(now()) @map("created_at")

  role         Role       @relation(fields: [roleId], references: [id], onDelete: Cascade)
  permission   Permission @relation(fields: [permissionId], references: [id], onDelete: Cascade)

  @@unique([roleId, permissionId])
  @@map("role_permissions")
}

model UserRole {
  id         String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId     String    @map("user_id") @db.Uuid
  roleId     String    @map("role_id") @db.Uuid
  tenantId   String    @map("tenant_id") @db.Uuid
  assignedBy String?   @map("assigned_by") @db.Uuid
  assignedAt DateTime  @default(now()) @map("assigned_at")
  expiresAt  DateTime? @map("expires_at")
  conditions Json?
  context    String?
  resourceId String?   @map("resource_id") @db.Uuid

  user         User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  role         Role          @relation(fields: [roleId], references: [id], onDelete: Cascade)
  organization Organization  @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([userId, roleId, tenantId, resourceId])
  @@map("user_roles")
}

model Persona {
  id                 String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId           String?   @map("tenant_id") @db.Uuid
  name               String
  displayName        String    @map("display_name")
  description        String?
  defaultRoleId      String?   @map("default_role_id") @db.Uuid
  uiConfig           Json      @default("{}") @map("ui_config")
  features           Json      @default("[]")
  permissionsOverride Json     @default("{}") @map("permissions_override")
  color              String?
  icon               String?
  isSystemPersona    Boolean   @default(false) @map("is_system_persona")
  isActive           Boolean   @default(true) @map("is_active")
  createdAt          DateTime  @default(now()) @map("created_at")
  updatedAt          DateTime  @updatedAt @map("updated_at")

  organization       Organization?       @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  userPersonas       UserPersona[]
  sessionContexts    UserSessionContext[]

  @@unique([tenantId, name])
  @@map("personas")
}

model UserPersona {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId      String    @map("user_id") @db.Uuid
  personaId   String    @map("persona_id") @db.Uuid
  tenantId    String    @map("tenant_id") @db.Uuid
  isDefault   Boolean   @default(false) @map("is_default")
  isActive    Boolean   @default(true) @map("is_active")
  assignedBy  String?   @map("assigned_by") @db.Uuid
  assignedAt  DateTime  @default(now()) @map("assigned_at")

  user         User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  persona      Persona       @relation(fields: [personaId], references: [id], onDelete: Cascade)
  organization Organization  @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([userId, personaId, tenantId])
  @@map("user_personas")
}

model AuditLog {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId       String?   @map("tenant_id") @db.Uuid
  userId         String?   @map("user_id") @db.Uuid
  sessionToken   String?   @map("session_token")
  eventType      String    @map("event_type")
  eventCategory  String    @map("event_category")
  resourceType   String?   @map("resource_type")
  resourceId     String?   @map("resource_id")
  eventData      Json      @default("{}") @map("event_data")
  oldValues      Json?     @map("old_values")
  newValues      Json?     @map("new_values")
  ipAddress      String?   @map("ip_address") @db.Inet
  userAgent      String?   @map("user_agent")
  requestId      String?   @map("request_id")
  severity       String    @default("info")
  status         String    @default("success")
  createdAt      DateTime  @default(now()) @map("created_at")

  organization   Organization? @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  user           User?         @relation(fields: [userId], references: [id])

  @@map("audit_logs")
}

// NextAuth.js tables
model Account {
  id                String  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId            String  @map("user_id") @db.Uuid
  type              String
  provider          String
  providerAccountId String  @map("provider_account_id")
  refreshToken      String? @map("refresh_token")
  accessToken       String? @map("access_token")
  expiresAt         Int?    @map("expires_at")
  tokenType         String? @map("token_type")
  scope             String?
  idToken           String? @map("id_token")
  sessionState      String? @map("session_state")
  createdAt         DateTime @default(now()) @map("created_at")
  updatedAt         DateTime @updatedAt @map("updated_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
  @@map("accounts")
}

model Session {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  sessionToken String   @unique @map("session_token")
  userId       String   @map("user_id") @db.Uuid
  expires      DateTime
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("sessions")
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@id([identifier, token])
  @@map("verification_tokens")
}
```

## Implementation Strategy

### Phase 1: Core Authentication (Week 1)
1. Implement NextAuth.js adapter tables
2. Set up organization and user management
3. Basic tenant isolation with RLS

### Phase 2: RBAC System (Week 2)
1. Create roles and permissions system
2. Implement role assignment workflows
3. Set up permission checking middleware

### Phase 3: Persona Management (Week 3)
1. Implement persona definitions
2. Create persona assignment system
3. Build persona context management

### Phase 4: Audit & Security (Week 4)
1. Implement comprehensive audit logging
2. Set up security event tracking
3. Create monitoring and alerting

## Performance Considerations

### Query Optimization
- Extensive indexing on frequently queried columns
- Materialized views for complex permission calculations
- Query result caching for permission checks

### Scaling Strategies
- Read replicas for permission lookups
- Connection pooling with tenant awareness
- Periodic cleanup of expired sessions and audit logs

## Security Measures

### Data Protection
- Row-level security for tenant isolation
- Encrypted sensitive data at rest
- Comprehensive audit trails

### Access Controls
- Multi-factor authentication support
- Session timeout and rotation
- Permission-based API access

## Monitoring and Maintenance

### Key Metrics
- Authentication success rate
- Permission check performance
- Audit log volume and patterns
- Session management efficiency

### Maintenance Tasks
- Regular cleanup of expired sessions
- Audit log archival and retention
- Permission cache refresh
- Security event analysis

## Positive Consequences

- **NextAuth.js Integration**: Seamless integration with established authentication library
- **Flexible RBAC**: Support for complex role hierarchies and permissions
- **Persona Management**: Context-aware access control for SaaS platform
- **Audit Compliance**: Comprehensive tracking for security and compliance
- **Performance**: Optimized for fast authentication and authorization
- **Scalability**: Designed to handle growth in users and complexity

## Negative Consequences

- **Complexity**: More complex schema than simple role-based systems
- **Maintenance**: Requires careful management of role hierarchies and permissions
- **Performance Overhead**: Additional queries for persona and audit management
- **Storage Requirements**: Extensive audit logging increases storage needs

## References

- [NextAuth.js Database Adapters](https://next-auth.js.org/adapters/overview)
- [PostgreSQL Row Level Security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [RBAC Design Patterns](https://csrc.nist.gov/CSRC/media/Publications/conference-paper/2000/07/26/the-nist-model-for-role-based-access-control-towards-a-unified-/documents/sandhu-ferraiolo-kuhn-00.pdf)
- [Prisma Multi-tenant Applications](https://www.prisma.io/docs/guides/database/multi-tenant)