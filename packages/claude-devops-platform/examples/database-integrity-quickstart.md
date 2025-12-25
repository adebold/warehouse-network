# Database Integrity Quick Start Guide

Get started with database integrity management in 5 minutes!

## 1. Installation

```bash
# Install the Claude DevOps Platform
npm install -g @claude/devops-platform

# Or add to your project
npm install --save-dev @claude/devops-platform
```

## 2. Initialize Configuration

```bash
# Create a configuration file
claude-platform db config --init

# Edit the configuration to match your database
# Default location: ./database-integrity.config.js
```

## 3. Basic Commands

### Check Migration Status
```bash
# See what migrations are pending
claude-platform db migrate:status
```

### Create a Migration
```bash
# Create a new migration file
claude-platform db migrate:create add-users-table

# Edit the generated file in ./migrations/
```

### Run Migrations
```bash
# Apply pending migrations
claude-platform db migrate

# Or preview first
claude-platform db migrate --dry-run
```

### Check for Drift
```bash
# Detect schema differences
claude-platform db drift:check

# If drift is found, generate fixes
claude-platform db drift:fix
```

### Generate TypeScript Types
```bash
# Create type definitions from your schema
claude-platform db schema:types
```

## 4. Add to package.json

```json
{
  "scripts": {
    "db:migrate": "claude-platform db migrate",
    "db:migrate:create": "claude-platform db migrate:create",
    "db:status": "claude-platform db migrate:status",
    "db:drift": "claude-platform db drift:check",
    "db:types": "claude-platform db schema:types",
    "db:validate": "claude-platform db validate:routes && claude-platform db validate:forms"
  }
}
```

## 5. CI/CD Integration

Add to your GitHub Actions workflow:

```yaml
- name: Check Database Integrity
  run: |
    # Install CLI
    npm install -g @claude/devops-platform
    
    # Check for pending migrations
    claude-platform db migrate:status --json
    
    # Check for drift
    claude-platform db drift:check --json
    
    # Validate API routes
    claude-platform db validate:routes --json
```

## 6. Common Workflows

### Development Workflow
```bash
# 1. Make schema changes
# 2. Create migration
npm run db:migrate:create my-changes

# 3. Run migration
npm run db:migrate

# 4. Generate types
npm run db:types

# 5. Validate everything
npm run db:validate
```

### Production Monitoring
```bash
# Start drift monitoring
claude-platform db monitor --interval 300 --webhook $SLACK_WEBHOOK
```

### Troubleshooting Drift
```bash
# 1. Check what's different
claude-platform db drift:check --detailed

# 2. Generate fix migrations
claude-platform db drift:fix

# 3. Review and apply
claude-platform db migrate
```

## 7. Environment Variables

```bash
# .env file
DB_HOST=localhost
DB_PORT=5432
DB_NAME=myapp
DB_USER=postgres
DB_PASSWORD=secret
NODE_ENV=development
```

## 8. Best Practices

1. **Always test migrations** in development first
2. **Use --dry-run** to preview changes
3. **Keep migrations small** and focused
4. **Generate types** after each migration
5. **Monitor drift** in production
6. **Review generated** fix migrations before applying

## Next Steps

- Read the [full documentation](./database-integrity-commands.md)
- Check out [example configurations](./database-integrity.config.js)
- Set up [GitHub Actions workflow](./github-workflow-database-drift.yml)
- Join our [Discord community](https://discord.gg/claude-platform)

## Need Help?

```bash
# Get help for any command
claude-platform db --help
claude-platform db migrate --help
claude-platform db drift:check --help
```