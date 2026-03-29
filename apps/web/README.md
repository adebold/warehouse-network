# Skidspace Authentication & SaaS System

A comprehensive multi-tenant SaaS authentication system built with Next.js, NextAuth.js, and Prisma.

## Features

- 🔐 **Multi-Provider Authentication** - Google, GitHub, and credentials
- 🏢 **Multi-Tenant Architecture** - Isolated organizations with subdomain support
- 👥 **Role-Based Access Control** - Hierarchical permissions system
- 🛡️ **Super Admin Management** - Platform-wide administration
- 📧 **User Invitations** - Email-based user onboarding
- 🎯 **Persona-Based Dashboards** - Tailored experiences for different user types
- 📊 **Audit Logging** - Complete activity tracking
- 🚀 **Production Ready** - Optimized for scale and security

## Architecture

### User Personas

1. **Super Admin** - Platform management and oversight
2. **Warehouse Owner/Manager** - Warehouse operations and staff management
3. **E-bike Business Owner/Manager** - Fleet and booking management
4. **Warehouse Operator** - Day-to-day warehouse operations
5. **Customer** - E-bike rentals and services

### Technology Stack

- **Framework**: Next.js 14 (App Router)
- **Authentication**: NextAuth.js v5 (Auth.js)
- **Database**: PostgreSQL with Prisma ORM
- **Styling**: Tailwind CSS + Radix UI
- **TypeScript**: Full type safety
- **Email**: Configurable SMTP/Resend integration

## Quick Start

### 1. Environment Setup

Copy the example environment file:

```bash
cp .env.example .env.local
```

Configure the required environment variables:

```env
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/skidspace_db"

# NextAuth.js
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-super-secret-key"

# OAuth Providers (optional)
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
GITHUB_CLIENT_ID="your-github-client-id"
GITHUB_CLIENT_SECRET="your-github-client-secret"

# Super Admin Security
SUPER_ADMIN_CODE="your-super-admin-security-code"
SUPER_ADMIN_SETUP_KEY="your-setup-key"
```

### 2. Database Setup

Install dependencies and set up the database:

```bash
npm install
npx prisma generate
npx prisma db push
npx prisma db seed
```

### 3. Run Development Server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to access the application.

## Initial Setup

### Super Admin Setup

1. Visit `/admin/setup` for first-time platform initialization
2. Use the `SUPER_ADMIN_SETUP_KEY` from your environment
3. Create the super admin account
4. Sign in at `/auth/signin?mode=super-admin`

### Default Credentials

After seeding, you can use these test credentials:

- **Email**: `superadmin@skidspace.com`
- **Password**: `SuperAdmin123!`
- **Admin Code**: Your `SUPER_ADMIN_CODE` value

## User Management

### Creating Organizations

Super admins can create organizations through the admin panel:

1. Navigate to **Organizations** → **Create New**
2. Select organization type (Warehouse, E-bike Business, Customer)
3. Configure settings and subscription tier
4. Invite initial users

### User Invitation Flow

1. **Admin invites user** via email
2. **User receives invitation** with secure token
3. **User completes registration** with organization context
4. **Automatic role assignment** based on invitation

### Role Hierarchy

```
Super Admin (Level 100)
├── Platform Admin (Level 90)
│
Organization Owners (Level 80)
├── Warehouse Owner
├── Business Owner
├── Account Owner
│
Organization Managers (Level 70)
├── Warehouse Manager
├── Business Manager
├── Fleet Coordinator
│
Organization Operators (Level 50)
├── Warehouse Operator
├── Customer Service
├── Account Member
│
Organization Viewers (Level 30)
├── Warehouse Viewer
├── Analytics User
```

## API Reference

### Authentication Endpoints

- `POST /api/auth/register` - User registration
- `GET|POST /api/auth/[...nextauth]` - NextAuth.js handlers
- `POST /api/admin/super/setup` - Super admin initialization

### Organization Management

- `GET /api/organizations` - List organizations
- `POST /api/organizations` - Create organization
- `PUT /api/organizations/[id]` - Update organization
- `DELETE /api/organizations/[id]` - Delete organization

### User Management

- `GET /api/users` - List users
- `POST /api/users` - Create user
- `PUT /api/users/[id]` - Update user
- `POST /api/users/[id]/roles` - Assign roles

### Invitation System

- `GET /api/invitations` - List invitations
- `POST /api/invitations` - Create invitation
- `POST /api/invitations/[token]/accept` - Accept invitation

## Security Features

### Authentication Security

- JWT tokens with RS256 encryption
- Session management with secure cookies
- Rate limiting on authentication endpoints
- CSRF protection built-in
- Secure password hashing with bcrypt

### Authorization

- Role-based access control (RBAC)
- Resource-level permissions
- Multi-tenant data isolation
- API route protection middleware
- UI component-level permission checks

### Audit & Compliance

- Complete audit logging
- User activity tracking
- Authentication event logging
- GDPR compliance features
- Data export capabilities

## Multi-Tenant Features

### Subdomain Support

Organizations can have custom subdomains:

- `acme.skidspace.com` → Acme Warehouse
- `bikerent.skidspace.com` → BikeRent Business
- Main platform at `skidspace.com`

### Data Isolation

- Database-level tenant separation
- Scoped queries and mutations
- Tenant-aware middleware
- Isolated file storage
- Separate analytics

### Customization

- Tenant-specific themes (future)
- Custom role definitions
- Configurable permissions
- Organization settings
- Feature toggles per tenant

## Development

### Database Migrations

```bash
# Create new migration
npx prisma migrate dev --name migration_name

# Apply migrations
npx prisma migrate deploy

# Reset database (development only)
npx prisma migrate reset
```

### Testing

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:auth
npm run test:rbac
npm run test:api

# Run E2E tests
npm run test:e2e
```

### Code Quality

```bash
# Lint code
npm run lint

# Type checking
npm run type-check

# Format code
npm run format
```

## Production Deployment

### Environment Variables

Ensure all production environment variables are set:

- Database connection (encrypted)
- NextAuth secrets (unique per environment)
- OAuth credentials (production apps)
- Email service configuration
- File upload/storage settings

### Database

1. Set up PostgreSQL instance
2. Configure connection pooling
3. Run migrations: `npx prisma migrate deploy`
4. Set up backups and monitoring

### Security Hardening

- Enable HTTPS only
- Configure security headers
- Set up rate limiting
- Enable audit logging
- Configure monitoring and alerts

### Scaling Considerations

- Database read replicas
- Redis for session storage
- CDN for static assets
- Load balancing
- Container orchestration

## Monitoring

### Health Checks

- Database connectivity
- External service status
- Authentication service health
- Email service availability

### Metrics

- User registration rates
- Authentication success/failure rates
- API response times
- Database query performance
- Error rates and types

### Alerting

- Failed authentication attempts
- Database connection issues
- High error rates
- Performance degradation
- Security events

## Contributing

### Development Guidelines

1. Follow TypeScript best practices
2. Write tests for new features
3. Update documentation
4. Follow conventional commit format
5. Ensure accessibility compliance

### Code Structure

```
src/
├── app/                 # Next.js App Router pages
├── components/          # React components
│   ├── ui/             # Base UI components
│   ├── auth/           # Authentication components
│   ├── dashboard/      # Dashboard components
│   └── admin/          # Admin components
├── lib/                # Utility functions
│   ├── auth.ts         # NextAuth configuration
│   ├── prisma.ts       # Database client
│   ├── rbac.ts         # Role-based access control
│   └── utils.ts        # General utilities
└── types/              # TypeScript type definitions
```

## Support

For questions or issues:

1. Check the documentation
2. Search existing issues
3. Create a new issue with details
4. Join our Discord community

## License

This project is licensed under the MIT License. See LICENSE file for details.