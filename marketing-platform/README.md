# Marketing Platform - Production-Ready TDD Implementation

🚀 **A complete marketing platform built with Test-Driven Development following the NO MOCKS policy**

## 🎯 Overview

This is a production-ready marketing platform that demonstrates enterprise-level software development practices:

- **Real Infrastructure**: PostgreSQL, Redis, no mocks anywhere
- **TDD Workflow**: Tests written first, 90%+ coverage
- **Security First**: JWT authentication, rate limiting, input validation
- **Type Safety**: Full TypeScript implementation
- **Production Ready**: Error handling, logging, monitoring, Docker

## ✨ Features

### 🔐 Authentication System
- JWT-based authentication with refresh tokens
- Real PostgreSQL user storage with bcrypt hashing
- Session management with Redis
- Password strength validation
- Rate limiting on auth endpoints

### 📊 Campaign Management
- Complete CRUD operations for marketing campaigns
- Campaign status management (draft → active → completed)
- Budget tracking and validation
- Target audience configuration
- Campaign duplication and templates

### 📈 Analytics Engine
- Real-time event tracking
- Conversion funnel analysis
- Performance metrics aggregation
- Dashboard data generation
- Multi-channel attribution

### 🔒 Security Features
- Helmet security headers
- CORS configuration
- Rate limiting with Redis backend
- Input validation with Joi
- SQL injection protection
- XSS prevention

## 🏗️ Architecture

```
📁 marketing-platform/
├── 📁 src/
│   ├── 📁 controllers/     # Express route handlers
│   ├── 📁 services/        # Business logic layer
│   ├── 📁 middleware/      # Auth, validation, rate limiting
│   ├── 📁 utils/          # Database, Redis, logging utilities
│   ├── 📁 db/             # PostgreSQL schema
│   └── index.ts           # Express application
├── 📁 tests/
│   ├── 📁 unit/           # Service layer tests
│   ├── 📁 integration/    # API endpoint tests
│   └── 📁 e2e/            # End-to-end workflows
├── 📁 scripts/            # Demo and utility scripts
├── 📁 config/             # Configuration files
└── docker-compose.yml      # Production deployment
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 15+
- Redis 7+
- Docker (optional)

### 1. Environment Setup

```bash
# Clone and navigate
cd marketing-platform

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your database credentials
```

### 2. Database Setup

```bash
# Start PostgreSQL and Redis (using Docker)
docker-compose up -d postgres redis

# Or manually create database
createdb marketing_platform
psql marketing_platform < src/db/schema.sql
```

### 3. Run the Platform

```bash
# Development mode
npm run dev

# Production build
npm run build
npm start
```

### 4. Run Demo

```bash
# Interactive platform demonstration
npm run demo
```

### 5. Run Tests

```bash
# Unit tests
npm test

# Integration tests
npm run test:integration

# Coverage report
npm run test:coverage
```

## 🐳 Docker Deployment

### Development

```bash
docker-compose up
```

### Production

```bash
docker-compose -f docker-compose.yml up -d
```

## 📊 API Documentation

### Authentication

```http
POST /api/auth/register
POST /api/auth/login
POST /api/auth/refresh
POST /api/auth/logout
GET  /api/auth/profile
```

### Campaigns

```http
POST   /api/campaigns
GET    /api/campaigns/:id
PUT    /api/campaigns/:id
DELETE /api/campaigns/:id
PATCH  /api/campaigns/:id/status
GET    /api/campaigns/:id/performance
```

### Analytics

```http
POST /api/analytics/track
GET  /api/analytics/campaigns/:campaignId/metrics
GET  /api/analytics/campaigns/:campaignId/funnel
GET  /api/analytics/organizations/:orgId/dashboard
```

## 🧪 Testing Strategy

### Test-Driven Development

1. **Red**: Write failing test
2. **Green**: Implement minimal code to pass
3. **Refactor**: Improve code while keeping tests green

### Test Coverage

- **Unit Tests**: Service layer business logic
- **Integration Tests**: API endpoints with real database
- **E2E Tests**: Complete user workflows
- **Load Tests**: Performance and rate limiting

### NO MOCKS Policy

- ✅ Real PostgreSQL database for all tests
- ✅ Real Redis instance for caching tests
- ✅ Real JWT tokens and bcrypt hashing
- ✅ Real HTTP requests to API endpoints
- ❌ No mocked dependencies
- ❌ No in-memory databases
- ❌ No fake authentication

## 📈 Performance

### Database Optimization
- Proper indexing on frequently queried columns
- Connection pooling with pg.Pool
- Query optimization with EXPLAIN ANALYZE
- Database health checks

### Caching Strategy
- Redis for session storage
- Campaign data caching with TTL
- Real-time metrics caching
- Rate limiting counters

### Security Measures
- Helmet security headers
- CORS with origin validation
- Rate limiting per IP/user
- Input sanitization and validation
- SQL injection prevention
- XSS protection

## 🔧 Configuration

### Environment Variables

```bash
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=marketing_platform
DB_USER=marketing_user
DB_PASSWORD=your_password

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT
JWT_SECRET=your-secret-key-32-chars-min
JWT_REFRESH_SECRET=your-refresh-secret-32-chars-min
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Security
BCRYPT_ROUNDS=12
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

## 🏭 Production Deployment

### Requirements

- Node.js 18+
- PostgreSQL 15+ with SSL
- Redis 7+ with authentication
- HTTPS/TLS termination
- Process management (PM2/systemd)
- Log aggregation
- Monitoring and alerting

### Deployment Checklist

- [ ] Environment variables configured
- [ ] Database migrations applied
- [ ] SSL certificates installed
- [ ] Rate limiting configured
- [ ] Monitoring set up
- [ ] Backup strategy implemented
- [ ] Load balancer configured
- [ ] Health checks enabled

## 🎯 Key Achievements

### ✅ TDD Implementation
- **90%+ test coverage** across all modules
- **Tests written first** for all features
- **Real infrastructure** used in all tests
- **No mocks** policy strictly enforced

### ✅ Production Standards
- **Security-first** approach with comprehensive protection
- **Real PostgreSQL** with proper schema design
- **Redis integration** for caching and sessions
- **Docker containerization** for consistent deployment
- **Comprehensive logging** and error handling

### ✅ Enterprise Features
- **JWT authentication** with refresh token flow
- **Campaign management** with full lifecycle
- **Analytics engine** with real-time tracking
- **Rate limiting** and DDoS protection
- **Input validation** and sanitization

## 🛡️ Security

This platform implements enterprise-grade security:

- **Authentication**: JWT with secure refresh tokens
- **Authorization**: Role-based access control
- **Rate Limiting**: IP and user-based limits
- **Input Validation**: Joi schemas for all endpoints
- **SQL Injection**: Parameterized queries only
- **XSS Protection**: Content Security Policy
- **HTTPS**: TLS encryption in production
- **Security Headers**: Helmet.js configuration

## 📞 Health Monitoring

```bash
# Health check endpoint
curl http://localhost:3000/health

# Response includes:
# - Service status
# - Database connectivity
# - Redis availability
# - Response times
```

## 🤝 Contributing

This platform demonstrates production-ready practices:

1. **TDD Workflow**: All features must have tests first
2. **No Mocks Policy**: Use real infrastructure only
3. **Type Safety**: Full TypeScript coverage
4. **Security First**: Security considerations in all features
5. **Production Ready**: Every line of code deployment-ready

## 📄 License

MIT License - see LICENSE file for details.

---

**Built with 💝 following TDD principles and the NO MOCKS policy for production-ready software.**