# Docker PostgreSQL Database Guide

## Overview
The warehouse network uses PostgreSQL running in Docker for database persistence. This guide explains how to connect, manage, and work with the Docker database.

## Connection Details
- **Host**: localhost (from host machine)
- **Port**: 5433 (external) → 5432 (internal)
- **Database**: warehouse_network
- **Username**: warehouse
- **Password**: warehouse123
- **Connection URL**: `postgresql://warehouse:warehouse123@localhost:5433/warehouse_network`

## Quick Commands

### Check Database Status
```bash
# Check if PostgreSQL container is running
docker ps | grep warehouse-postgres

# Check database logs
docker logs warehouse-postgres

# Access PostgreSQL CLI
docker exec -it warehouse-postgres psql -U warehouse -d warehouse_network
```

### Database Operations
```bash
# Apply migrations
./scripts/docker-migrate.sh

# Seed database with test data
node scripts/seed-docker-db.js

# Verify database schema and data
node scripts/verify-docker-db.js

# Test Prisma connection
node scripts/test-prisma-docker-connection.js
```

## Prisma Configuration

### For Docker Database
```javascript
// Use this configuration when connecting to Docker PostgreSQL
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://warehouse:warehouse123@localhost:5433/warehouse_network'
    }
  }
});
```

### Environment Variables
```bash
# For Docker PostgreSQL (port 5433)
DATABASE_URL=postgresql://warehouse:warehouse123@localhost:5433/warehouse_network

# For local PostgreSQL (port 5432)
DATABASE_URL=postgresql://adebold@localhost:5432/warehouse_network
```

## Database Schema
The database contains 44 tables including:

### Core Tables
- **User**: System users and authentication
- **Operator**: Warehouse operators/companies
- **Warehouse**: Individual warehouse facilities
- **Customer**: Customer organizations
- **Lead**: Sales leads
- **Quote**: Price quotes for warehouse services
- **RFQ**: Request for quotes

### Supporting Tables
- **PricingRule**: Dynamic pricing rules
- **WarehouseFeature**: Warehouse capabilities
- **WarehouseImage**: Facility images
- **CityPage**: SEO city landing pages
- **Platform**: Multi-tenant platform support

## Docker Compose Services

### PostgreSQL Service
```yaml
postgres:
  image: postgres:15-alpine
  container_name: warehouse-postgres
  ports:
    - "5433:5432"
  environment:
    POSTGRES_USER: warehouse
    POSTGRES_PASSWORD: warehouse123
    POSTGRES_DB: warehouse_network
```

### Redis Service
```yaml
redis:
  image: redis:7-alpine
  container_name: warehouse-redis
  ports:
    - "6380:6379"
```

## Troubleshooting

### Connection Issues
1. **Port Conflict**: Ensure port 5433 is available
   ```bash
   lsof -i :5433
   ```

2. **Container Not Running**: Start the container
   ```bash
   docker-compose up -d postgres
   ```

3. **Database Not Created**: Create database manually
   ```bash
   docker exec warehouse-postgres createdb -U warehouse warehouse_network
   ```

### Migration Issues
1. **Pending Migrations**: Apply them
   ```bash
   export DATABASE_URL="postgresql://warehouse:warehouse123@localhost:5433/warehouse_network"
   cd apps/web && npx prisma migrate deploy
   ```

2. **Schema Out of Sync**: Reset and reapply
   ```bash
   npx prisma migrate reset --force
   ```

## Test Data
The seed script creates:
- 2 test users (test@example.com, admin@warehouse.com)
- 2 operators (Global Logistics, Metro Storage)
- 2 warehouses (Chicago, Los Angeles)
- 1 customer (Acme Corporation)
- Sample quotes, pricing rules, and city pages

## Security Notes
- Default credentials are for development only
- Use strong passwords in production
- Enable SSL for production connections
- Restrict network access in production

## Backup and Restore

### Backup
```bash
docker exec warehouse-postgres pg_dump -U warehouse warehouse_network > backup.sql
```

### Restore
```bash
docker exec -i warehouse-postgres psql -U warehouse warehouse_network < backup.sql
```

## Performance Monitoring
```bash
# Check active connections
docker exec warehouse-postgres psql -U warehouse -d warehouse_network -c "SELECT count(*) FROM pg_stat_activity;"

# Check table sizes
docker exec warehouse-postgres psql -U warehouse -d warehouse_network -c "SELECT relname, pg_size_pretty(pg_total_relation_size(relid)) FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC;"
```