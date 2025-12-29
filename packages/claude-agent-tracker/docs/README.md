# @warehouse-network/claude-agent-tracker

Enterprise-grade agent tracking and change management platform with real-time monitoring, PostgreSQL persistence, and JWT authentication.

## 🚀 Features

- **Real-time Agent Tracking** - Monitor agent activities with WebSocket connections
- **Change Management** - Track and audit all system changes with detailed logging
- **PostgreSQL Persistence** - Enterprise-grade database with connection pooling
- **JWT Authentication** - Secure token-based authentication with refresh tokens
- **Redis Caching** - High-performance caching and session management
- **Prometheus Metrics** - Production-ready monitoring and alerting
- **Health Checks** - Comprehensive system health monitoring
- **Audit Logging** - Complete audit trail for compliance
- **Rate Limiting** - DDoS protection and API rate limiting
- **Security Headers** - OWASP-compliant security implementation

## 📦 Installation

```bash
npm install @warehouse-network/claude-agent-tracker
```

## 🛠️ Quick Start

### Basic Usage

```typescript
import { AgentTracker, createServer } from '@warehouse-network/claude-agent-tracker';

// Create tracker instance
const tracker = new AgentTracker({
  database: {
    host: 'localhost',
    port: 5432,
    database: 'warehouse_network',
    user: 'postgres',
    password: 'your-password',
    ssl: true
  },
  redis: {
    host: 'localhost',
    port: 6379
  },
  auth: {
    jwtSecret: 'your-jwt-secret'
  }
});

// Start server
const server = createServer(tracker);
server.listen(3000, () => {
  console.log('Agent tracker running on port 3000');
});
```

### CLI Usage

```bash
# Install globally
npm install -g @warehouse-network/claude-agent-tracker

# Start tracking server
claude-agent-tracker start --port 3000

# Track specific agent
claude-agent-tracker track --agent-id "agent-123" --project "warehouse-app"

# Generate reports
claude-agent-tracker report --type daily --format json

# Health check
claude-agent-tracker health
```

## 🔧 Configuration

### Environment Variables

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=warehouse_network
DB_USER=postgres
DB_PASSWORD=your-password

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password

# Authentication
JWT_SECRET=your-jwt-secret
JWT_EXPIRY=24h
REFRESH_TOKEN_EXPIRY=7d

# Monitoring
MONITORING_ENABLED=true
METRICS_INTERVAL=60000
HEALTH_CHECK_INTERVAL=30000

# Server
PORT=3000
NODE_ENV=production
```

### Database Setup

```sql
-- Create database
CREATE DATABASE warehouse_network;

-- Create user with proper permissions
CREATE USER warehouse_user WITH PASSWORD 'secure-password';
GRANT ALL PRIVILEGES ON DATABASE warehouse_network TO warehouse_user;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
```

## 📊 Monitoring & Metrics

### Prometheus Metrics

The tracker exposes metrics on `/metrics` endpoint:

- `agent_tracker_active_agents` - Number of active agents
- `agent_tracker_changes_total` - Total number of changes tracked
- `agent_tracker_errors_total` - Total number of errors
- `agent_tracker_response_duration_seconds` - Response time histogram

### Health Checks

Health status available at `/health`:

```json
{
  "status": "healthy",
  "timestamp": "2023-12-26T10:00:00Z",
  "checks": {
    "database": "healthy",
    "redis": "healthy",
    "memory": "healthy"
  }
}
```

## 🔐 Authentication & Security

### JWT Authentication

```typescript
import { AuthManager } from '@warehouse-network/claude-agent-tracker';

const auth = new AuthManager({
  jwtSecret: 'your-secret',
  jwtExpiry: '24h'
});

// Login user
const { token, refreshToken } = await auth.login(credentials);

// Verify token
const payload = await auth.verifyToken(token);
```

### Rate Limiting

Built-in rate limiting protects against abuse:

- 100 requests per 15 minutes per IP
- Configurable limits per endpoint
- Redis-backed for distributed environments

## 📈 Real-time Features

### WebSocket Connection

```typescript
import { WebSocketManager } from '@warehouse-network/claude-agent-tracker';

const wsManager = new WebSocketManager();

// Listen for agent changes
wsManager.on('agent-update', (data) => {
  console.log('Agent updated:', data);
});

// Send real-time notifications
wsManager.broadcast('notification', {
  type: 'info',
  message: 'System update completed'
});
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run unit tests
npm run test:unit

# Run integration tests  
npm run test:integration

# Coverage report
npm run test:coverage
```

## 🐳 Docker Deployment

```dockerfile
FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["npm", "run", "start:prod"]
```

```yaml
# docker-compose.yml
version: '3.8'
services:
  agent-tracker:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DB_HOST=postgres
      - REDIS_HOST=redis
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: warehouse_network
      POSTGRES_USER: warehouse_user
      POSTGRES_PASSWORD: secure-password
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

## 📚 API Documentation

### REST Endpoints

```
GET    /health              - Health check
GET    /metrics             - Prometheus metrics
POST   /auth/login          - User authentication
POST   /auth/refresh        - Refresh JWT token
GET    /agents              - List all agents
POST   /agents              - Create new agent
GET    /agents/:id          - Get agent details
PUT    /agents/:id          - Update agent
DELETE /agents/:id          - Delete agent
GET    /changes             - List changes
POST   /changes             - Record change
GET    /reports/daily       - Daily report
GET    /reports/weekly      - Weekly report
```

### WebSocket Events

```
agent-connected     - Agent connection established
agent-disconnected  - Agent disconnection
agent-updated      - Agent information updated
change-recorded    - New change recorded
notification       - System notification
```

## 🔧 Production Deployment

### Requirements

- Node.js 20+
- PostgreSQL 13+
- Redis 6+
- 2GB+ RAM
- SSL certificate

### Performance Tuning

```javascript
// Production configuration
const config = {
  database: {
    pool: {
      min: 5,
      max: 20,
      acquireTimeoutMillis: 30000,
      idleTimeoutMillis: 600000
    }
  },
  redis: {
    maxRetryDelayOnFailover: 100,
    enableReadyCheck: false,
    maxRetriesPerRequest: 3
  }
};
```

## 📖 Advanced Usage

### Custom Validators

```typescript
import { AgentTracker } from '@warehouse-network/claude-agent-tracker';

const tracker = new AgentTracker();

// Add custom validation
tracker.addValidator('custom-check', async (agent) => {
  // Custom validation logic
  return {
    valid: true,
    message: 'Validation passed'
  };
});
```

### Event Hooks

```typescript
// Register event handlers
tracker.on('agent-registered', (agent) => {
  console.log('New agent registered:', agent.id);
});

tracker.on('change-detected', (change) => {
  // Send to external monitoring system
  monitoring.recordChange(change);
});
```

## 🆘 Support

- **Documentation**: [Full API Reference](./api-reference.md)
- **Issues**: [GitHub Issues](https://github.com/warehouse-network/platform/issues)
- **Security**: security@warehouse-network.com

## 📄 License

MIT License - see [LICENSE](../LICENSE) file for details.

---

**Part of the Warehouse Network Platform** - Enterprise logistics and warehouse management suite.