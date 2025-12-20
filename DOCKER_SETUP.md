# Warehouse Network - Docker Setup Guide

## Quick Start

The platform is now running! Access it at: **http://localhost:3000**

## Services

| Service | URL/Port | Purpose |
|---------|----------|---------|
| Web App | http://localhost:3000 | Next.js application |
| PostgreSQL | localhost:5433 | Database |
| Redis | localhost:6380 | Caching & sessions |

## Docker Commands

### Start the platform
```bash
docker-compose up -d
```

### Stop the platform
```bash
docker-compose down
```

### View logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f app
```

### Restart services
```bash
docker-compose restart
```

### Access database
```bash
docker exec -it warehouse-postgres psql -U warehouse warehouse_network
```

### Access Redis
```bash
docker exec -it warehouse-redis redis-cli
```

## Troubleshooting

### Port conflicts
If you get port conflicts, the ports are configured in `docker-compose.yml`:
- Change `${DB_PORT:-5433}:5432` for PostgreSQL
- Change `${REDIS_PORT:-6380}:6379` for Redis
- Change `${APP_PORT:-3000}:3000` for the web app

### Rebuild after code changes
The app runs in development mode with hot-reloading, so most changes don't require a rebuild. If you modify dependencies:
```bash
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

## Development Notes

- The app runs in development mode with hot-reloading enabled
- TypeScript errors are temporarily fixed/commented in:
  - `/apps/web/pages/api/stripe/webhook.ts`
  - `/apps/web/pages/app/disputes/new.tsx`
  - `/apps/web/pages/app/inventory.tsx`
  - `/apps/web/pages/app/quotes/[id].tsx`
- Database migrations run automatically on startup
- Environment variables are configured in `.env` file

## Next Steps

1. Access the platform at http://localhost:3000
2. Create an account or login
3. Explore the warehouse listing features
4. Check `/login` for authentication
5. Visit `/search` to browse warehouse listings