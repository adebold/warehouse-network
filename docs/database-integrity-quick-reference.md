# Database Integrity CLI - Quick Reference

## Most Common Commands

```bash
# Full system check
npm run db:integrity check

# Check for drifts
npm run db:integrity drift:detect

# View recent errors
npm run db:integrity logs:view --level ERROR

# Export logs for audit
npm run db:integrity logs:export -o audit.json
```

## Verbose Mode

Add `-v` for detailed output on any command:

```bash
npm run db:integrity -v check
npm run db:integrity -v migrate:status
```

## Migration Commands

| Command | Description |
|---------|-------------|
| `migrate:status` | Show migration status |
| `migrate:run` | Run pending migrations |
| `migrate:run --dry-run` | Preview migrations |
| `migrate:prisma` | Run Prisma migrations |
| `migrate:prisma --deploy` | Production deployment |

## Drift Detection

| Command | Description |
|---------|-------------|
| `drift:detect` | Detect schema drifts |
| `drift:detect --fix` | Auto-generate fix migrations |
| `drift:prisma` | Check Prisma schema sync |

## Validation

| Command | Description |
|---------|-------------|
| `validate:forms` | Validate forms against models |
| `validate:routes` | Validate API routes |
| `validate:warehouse` | Check warehouse-specific integrity |

## Log Management

| Command | Description |
|---------|-------------|
| `logs:view` | View recent logs |
| `logs:view -l 50` | View last 50 logs |
| `logs:view -c MIGRATION` | Filter by category |
| `logs:view --level ERROR` | Filter by level |
| `logs:export -f csv -o logs.csv` | Export as CSV |
| `logs:stats` | Show log statistics |
| `logs:stats -d 30` | Stats for last 30 days |

## Log Filters

### Categories
- `VALIDATION`
- `MIGRATION`
- `DRIFT_DETECTION`
- `SCHEMA_ANALYSIS`
- `FORM_VALIDATION`
- `ROUTE_VALIDATION`
- `PERFORMANCE`
- `ERROR`
- `AUDIT`
- `MAINTENANCE`

### Levels
- `DEBUG`
- `INFO`
- `WARNING`
- `ERROR`
- `CRITICAL`

## Examples

### Daily Health Check
```bash
npm run db:integrity check
npm run db:integrity logs:stats -d 1
```

### Pre-Deployment Validation
```bash
npm run db:integrity drift:detect
npm run db:integrity validate:warehouse
npm run db:integrity migrate:status
```

### Troubleshooting
```bash
npm run db:integrity -v logs:view --level ERROR -l 100
npm run db:integrity logs:export -s 2024-01-01 -o errors.json
```

### Performance Analysis
```bash
npm run db:integrity logs:view -c PERFORMANCE -l 50
npm run db:integrity schema:analyze
```

## Tips

1. Use verbose mode (`-v`) when debugging
2. Export logs before major operations
3. Check drifts before running migrations
4. Review error logs daily
5. Monitor performance metrics weekly