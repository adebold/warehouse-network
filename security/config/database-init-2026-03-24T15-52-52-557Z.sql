-- Skidspace Production Database Initialization
-- Generated: 2026-03-24T15:52:52.844Z
-- Super Admin Setup

BEGIN;

-- Create platform organization
INSERT INTO organizations (
  id,
  name,
  slug,
  type,
  status,
  settings,
  created_at,
  updated_at
) VALUES (
  'e70a3622-90cf-4cf3-aaf4-6562d59f6d04',
  'Skidspace Platform',
  'platform',
  'PLATFORM',
  'ACTIVE',
  '{"isPlatform": true, "maxUsers": 10000}',
  NOW(),
  NOW()
);

-- Create super admin user
INSERT INTO users (
  id,
  email,
  email_verified,
  name,
  password,
  organization_id,
  status,
  preferences,
  created_at,
  updated_at,
  last_login_at
) VALUES (
  'a746b39d-5579-4b91-844d-6cdb83cf0a17',
  'admin@skidspace.com',
  NOW(),
  'Platform Administrator',
  '$2a$12$LEHCwIDZjFsJRiig.qdVkOZ8/jpIFgoFIIltooBJT2JVVWYDjraom',
  'e70a3622-90cf-4cf3-aaf4-6562d59f6d04',
  'ACTIVE',
  '{"theme": "system", "notifications": true}',
  NOW(),
  NOW(),
  NULL
);

-- Create super admin role
INSERT INTO roles (
  id,
  name,
  slug,
  description,
  organization_id,
  level,
  is_system,
  is_default,
  color,
  icon,
  created_at,
  updated_at
) VALUES (
  'c26bf9ac-0c49-4665-8fbd-87cfac0c0065',
  'Super Administrator',
  'super-admin',
  'Platform super administrator with full system access',
  'e70a3622-90cf-4cf3-aaf4-6562d59f6d04',
  100,
  true,
  false,
  '#DC2626',
  'shield-check',
  NOW(),
  NOW()
);

-- Create platform permissions
INSERT INTO permissions (name, slug, description, category, organization_id, is_system, created_at, updated_at)
VALUES
  ('Platform Administration', 'platform:admin', 'Full platform administration access', 'platform', 'e70a3622-90cf-4cf3-aaf4-6562d59f6d04', true, NOW(), NOW()),
  ('User Management', 'users:manage', 'Create, read, update, delete users', 'users', 'e70a3622-90cf-4cf3-aaf4-6562d59f6d04', true, NOW(), NOW()),
  ('Organization Management', 'organizations:manage', 'Manage all organizations', 'organizations', 'e70a3622-90cf-4cf3-aaf4-6562d59f6d04', true, NOW(), NOW()),
  ('Warehouse Management', 'warehouses:manage', 'Manage all warehouses', 'warehouses', 'e70a3622-90cf-4cf3-aaf4-6562d59f6d04', true, NOW(), NOW()),
  ('System Configuration', 'system:config', 'Configure system settings', 'system', 'e70a3622-90cf-4cf3-aaf4-6562d59f6d04', true, NOW(), NOW()),
  ('Audit Access', 'audit:read', 'Read audit logs', 'audit', 'e70a3622-90cf-4cf3-aaf4-6562d59f6d04', true, NOW(), NOW());

-- Assign super admin role to user
INSERT INTO user_roles (
  id,
  user_id,
  role_id,
  assigned_by,
  assigned_at
) VALUES (
  '280fb405-ac9b-407c-914a-0ddc219c91e4',
  'a746b39d-5579-4b91-844d-6cdb83cf0a17',
  (SELECT id FROM roles WHERE slug = 'super-admin' AND organization_id = 'e70a3622-90cf-4cf3-aaf4-6562d59f6d04'),
  'a746b39d-5579-4b91-844d-6cdb83cf0a17',
  NOW()
);

-- Assign all permissions to super admin role
INSERT INTO role_permissions (id, role_id, permission_id)
SELECT
  gen_random_uuid(),
  (SELECT id FROM roles WHERE slug = 'super-admin' AND organization_id = 'e70a3622-90cf-4cf3-aaf4-6562d59f6d04'),
  p.id
FROM permissions p
WHERE p.organization_id = 'e70a3622-90cf-4cf3-aaf4-6562d59f6d04';

-- Create system configuration entries
INSERT INTO system_config (id, key, value, description, category, created_at, updated_at)
VALUES
  ('740db9aa-a75c-4f36-b817-65172f49ef97', 'platform.initialized', 'true', 'Platform initialization status', 'system', NOW(), NOW()),
  ('28c92964-62cd-4424-bd70-a5d12b50cdfc', 'platform.version', '"1.0.0"', 'Current platform version', 'system', NOW(), NOW()),
  ('9b677baa-bea8-422a-baa2-d9503af3c70c', 'security.mfa_required', 'true', 'Require MFA for admin users', 'security', NOW(), NOW()),
  ('e9d66b7a-c04b-4f0f-9f13-80379fe7a874', 'security.session_timeout', '86400', 'Session timeout in seconds', 'security', NOW(), NOW());

-- Create initial audit log entry
INSERT INTO audit_logs (
  id,
  user_id,
  organization_id,
  action,
  resource,
  status,
  details,
  created_at
) VALUES (
  '9a017cd3-5924-4650-9c35-8166724c06f2',
  'a746b39d-5579-4b91-844d-6cdb83cf0a17',
  'e70a3622-90cf-4cf3-aaf4-6562d59f6d04',
  'system.initialize',
  'platform',
  'success',
  '{"message": "Platform initialized with super admin user", "version": "1.0.0"}',
  NOW()
);

COMMIT;

-- Verify installation
SELECT
  u.email,
  u.name,
  o.name as organization,
  r.name as role,
  COUNT(p.id) as permissions_count
FROM users u
JOIN organizations o ON u.organization_id = o.id
JOIN user_roles ur ON u.id = ur.user_id
JOIN roles r ON ur.role_id = r.id
LEFT JOIN role_permissions rp ON r.id = rp.role_id
LEFT JOIN permissions p ON rp.permission_id = p.id
WHERE u.email = 'admin@skidspace.com'
GROUP BY u.email, u.name, o.name, r.name;
