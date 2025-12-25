# Database Integrity CLI Commands

The Claude DevOps Platform provides comprehensive database integrity management through a powerful CLI. This guide covers all available database commands and their usage.

## Table of Contents

- [Installation](#installation)
- [Configuration](#configuration)
- [Migration Commands](#migration-commands)
- [Drift Detection Commands](#drift-detection-commands)
- [Schema Analysis Commands](#schema-analysis-commands)
- [Validation Commands](#validation-commands)
- [Monitoring Commands](#monitoring-commands)
- [Examples](#examples)
- [Best Practices](#best-practices)

## Installation

```bash
# Install globally
npm install -g @claude/devops-platform

# Or use in your project
npm install --save-dev @claude/devops-platform
```

## Configuration

Before using database commands, create a configuration file:

```bash
claude-platform db config --init
```

This creates a `database-integrity.config.js` file. Edit it to match your database setup:

```javascript
module.exports = {
  database: {
    connection: {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'myapp',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,
    },
    // ... other settings
  }
};
```

## Migration Commands

### `claude-platform db migrate`

Run pending database migrations.

**Options:**
- `--dry-run` - Show what would be migrated without applying changes
- `--json` - Output results in JSON format
- `--force` - Force migration even with warnings

**Examples:**

```bash
# Run all pending migrations
claude-platform db migrate

# See what would be migrated
claude-platform db migrate --dry-run

# Force migration with warnings
claude-platform db migrate --force

# Get JSON output for automation
claude-platform db migrate --json
```

### `claude-platform db migrate:create <name>`

Create a new migration file.

**Options:**
- `--sql` - Generate SQL migration instead of TypeScript
- `--template <template>` - Use a specific template (table, index, constraint)

**Examples:**

```bash
# Create a TypeScript migration
claude-platform db migrate:create add-users-table

# Create a SQL migration
claude-platform db migrate:create add-users-table --sql

# Use a template
claude-platform db migrate:create add-user-index --template index
```

### `claude-platform db migrate:status`

Show migration status and history.

**Options:**
- `--json` - Output in JSON format
- `--verbose` - Show detailed migration information

**Examples:**

```bash
# Show migration status
claude-platform db migrate:status

# Get detailed information
claude-platform db migrate:status --verbose

# JSON output for CI/CD
claude-platform db migrate:status --json
```

### `claude-platform db migrate:rollback [steps]`

Rollback database migrations.

**Options:**
- `--dry-run` - Show what would be rolled back without applying changes
- `--json` - Output in JSON format

**Examples:**

```bash
# Rollback last migration
claude-platform db migrate:rollback

# Rollback last 3 migrations
claude-platform db migrate:rollback 3

# Preview rollback
claude-platform db migrate:rollback 2 --dry-run
```

## Drift Detection Commands

### `claude-platform db drift:check`

Check for database schema drift between your actual database and migration files.

**Options:**
- `--json` - Output in JSON format
- `--detailed` - Show detailed drift analysis
- `--schema <schema>` - Check specific schema only

**Examples:**

```bash
# Basic drift check
claude-platform db drift:check

# Detailed drift analysis
claude-platform db drift:check --detailed

# Check specific schema
claude-platform db drift:check --schema public

# JSON output for automation
claude-platform db drift:check --json
```

### `claude-platform db drift:fix`

Generate migrations to fix detected drift.

**Options:**
- `--dry-run` - Show what would be fixed without creating migrations
- `--json` - Output in JSON format
- `--auto-approve` - Auto-approve generated migrations

**Examples:**

```bash
# Generate fix migrations
claude-platform db drift:fix

# Preview fixes
claude-platform db drift:fix --dry-run

# Auto-approve and generate
claude-platform db drift:fix --auto-approve
```

## Schema Analysis Commands

### `claude-platform db schema:analyze`

Analyze current database schema for performance issues and optimization opportunities.

**Options:**
- `--json` - Output in JSON format
- `--performance` - Include performance analysis
- `--suggestions` - Include optimization suggestions

**Examples:**

```bash
# Basic schema analysis
claude-platform db schema:analyze

# Full analysis with performance metrics
claude-platform db schema:analyze --performance --suggestions

# JSON output for reporting
claude-platform db schema:analyze --json --performance
```

### `claude-platform db schema:types`

Generate TypeScript types from database schema.

**Options:**
- `--output <path>` - Output file path (default: `./src/types/database.ts`)
- `--json` - Output in JSON format
- `--enums` - Generate enums for constraint values
- `--interfaces` - Generate interfaces instead of types

**Examples:**

```bash
# Generate types with default settings
claude-platform db schema:types

# Generate with enums
claude-platform db schema:types --enums

# Use interfaces and custom output
claude-platform db schema:types --interfaces --output ./src/db-types.ts
```

## Validation Commands

### `claude-platform db validate:routes`

Validate API routes against database schema to ensure consistency.

**Options:**
- `--json` - Output in JSON format
- `--fix` - Attempt to fix validation errors
- `--strict` - Enable strict validation mode

**Examples:**

```bash
# Validate all routes
claude-platform db validate:routes

# Fix validation errors
claude-platform db validate:routes --fix

# Strict validation
claude-platform db validate:routes --strict
```

### `claude-platform db validate:forms`

Validate frontend forms against database constraints.

**Options:**
- `--json` - Output in JSON format
- `--fix` - Generate form validation rules
- `--framework <framework>` - Target framework (react, vue, angular)

**Examples:**

```bash
# Validate forms for React
claude-platform db validate:forms --framework react

# Generate validation rules
claude-platform db validate:forms --fix

# Validate Vue forms
claude-platform db validate:forms --framework vue
```

## Monitoring Commands

### `claude-platform db monitor`

Start real-time database drift monitoring.

**Options:**
- `--interval <seconds>` - Check interval in seconds (default: 60)
- `--webhook <url>` - Webhook URL for drift notifications
- `--json` - Output in JSON format
- `--daemon` - Run as daemon process

**Examples:**

```bash
# Start monitoring with default settings
claude-platform db monitor

# Monitor every 5 minutes with webhook
claude-platform db monitor --interval 300 --webhook https://hooks.slack.com/xxx

# Run as daemon
claude-platform db monitor --daemon --interval 600

# JSON output for log aggregation
claude-platform db monitor --json
```

### `claude-platform db config`

Manage database integrity configuration.

**Options:**
- `--init` - Initialize new configuration
- `--update` - Update existing configuration
- `--validate` - Validate configuration file

**Examples:**

```bash
# Create initial configuration
claude-platform db config --init

# Validate existing configuration
claude-platform db config --validate

# Update configuration (coming soon)
claude-platform db config --update
```

## Examples

### Complete Migration Workflow

```bash
# 1. Check current status
claude-platform db migrate:status

# 2. Create a new migration
claude-platform db migrate:create add-products-table

# 3. Edit the migration file
# ... edit migrations/20240101000000_add-products-table.ts ...

# 4. Preview migration
claude-platform db migrate --dry-run

# 5. Run migration
claude-platform db migrate

# 6. Verify no drift
claude-platform db drift:check
```

### Drift Detection and Fix Workflow

```bash
# 1. Check for drift
claude-platform db drift:check --detailed

# 2. If drift detected, preview fixes
claude-platform db drift:fix --dry-run

# 3. Generate fix migrations
claude-platform db drift:fix

# 4. Review generated migrations
claude-platform db migrate:status

# 5. Apply fixes
claude-platform db migrate
```

### Setting Up CI/CD Integration

```bash
# In your CI/CD pipeline:

# 1. Check migration status
claude-platform db migrate:status --json > migration-status.json

# 2. Check for drift
claude-platform db drift:check --json > drift-report.json

# 3. Fail build if drift detected
if [ $(jq '.hasDrift' drift-report.json) == "true" ]; then
  echo "Schema drift detected!"
  exit 1
fi

# 4. Run migrations in staging
claude-platform db migrate --json
```

### Type Generation Workflow

```bash
# 1. Generate initial types
claude-platform db schema:types --enums --output ./src/types/db.ts

# 2. Add to package.json scripts
{
  "scripts": {
    "db:types": "claude-platform db schema:types --enums",
    "db:check": "claude-platform db drift:check"
  }
}

# 3. Run after migrations
npm run db:types
```

## Best Practices

### 1. Always Use Configuration File

Create and maintain a `database-integrity.config.js`:
- Separate configurations per environment
- Use environment variables for secrets
- Version control the configuration (exclude secrets)

### 2. Migration Best Practices

- **Naming**: Use descriptive names like `add-user-roles-table`
- **Atomicity**: Keep migrations small and focused
- **Rollback**: Always implement rollback methods
- **Testing**: Test migrations in development first
- **Review**: Code review migration files

### 3. Drift Detection

- Run drift detection in CI/CD pipelines
- Monitor production databases regularly
- Fix drift immediately to prevent accumulation
- Document any intentional drift

### 4. Schema Design

- Follow consistent naming conventions
- Add indexes for foreign keys
- Use appropriate data types
- Document column purposes
- Regular performance analysis

### 5. Type Safety

- Generate types after each migration
- Commit generated types to version control
- Use types throughout your application
- Regenerate types in CI/CD

### 6. Monitoring

- Set up drift monitoring in production
- Configure alerts for critical changes
- Regular schema health checks
- Track migration execution times

## Environment Variables

The CLI respects these environment variables:

```bash
# Database connection
DB_HOST=localhost
DB_PORT=5432
DB_NAME=myapp
DB_USER=postgres
DB_PASSWORD=secret

# Node environment
NODE_ENV=production

# Monitoring
SLACK_WEBHOOK_URL=https://hooks.slack.com/xxx
DRIFT_ALERT_EMAIL=team@example.com

# Features
AUTO_MIGRATION=false
DRIFT_DETECTION=true
SCHEMA_VALIDATION=true
TYPE_GENERATION=true
```

## Troubleshooting

### Common Issues

**1. Connection Errors**
```bash
# Test database connection
claude-platform db migrate:status

# Check configuration
claude-platform db config --validate
```

**2. Migration Conflicts**
```bash
# Check migration status
claude-platform db migrate:status --verbose

# Rollback if needed
claude-platform db migrate:rollback
```

**3. Drift Detection False Positives**
- Configure `ignoreTables` and `ignoreColumns` in config
- Use `--detailed` flag to understand differences
- Check for case sensitivity issues

**4. Type Generation Issues**
- Ensure database connection is active
- Check for custom type mappings in config
- Verify output directory exists

## Advanced Usage

### Custom Migration Templates

Create custom templates in your config:

```javascript
migrations: {
  templates: {
    table: './templates/migration-table.ts',
    index: './templates/migration-index.ts',
  }
}
```

### Webhook Integration

Configure webhooks for drift notifications:

```javascript
monitoring: {
  webhooks: [{
    url: process.env.SLACK_WEBHOOK_URL,
    events: ['drift_detected', 'migration_failed'],
    headers: {
      'Authorization': 'Bearer ' + process.env.WEBHOOK_TOKEN
    }
  }]
}
```

### Multi-Database Support

Configure multiple databases:

```javascript
databases: {
  primary: { /* main config */ },
  analytics: { /* analytics db config */ }
}
```

Then use:
```bash
claude-platform db migrate --database analytics
```

## Support

- GitHub Issues: https://github.com/claude/devops-platform/issues
- Documentation: https://claude-platform.dev/docs
- Discord: https://discord.gg/claude-platform