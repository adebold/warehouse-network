# Product Requirements Document (PRD)
# Skidspace.com Authentication & Persona-Based SaaS System

**Document Version:** 1.0
**Date:** March 23, 2026
**Product Owner:** Platform Engineering Team
**Status:** Draft for Review

---

## 1. Executive Summary & Goals

### 1.1 Product Vision
Skidspace.com is a comprehensive warehouse marketplace platform that connects warehouse operators with business customers seeking storage solutions. The authentication and persona-based SaaS system is the foundational layer that enables secure, role-based access across our multi-tenant platform.

### 1.2 Business Objectives
- **Primary Goal**: Establish a secure, scalable authentication system supporting 4 distinct user personas
- **Revenue Impact**: Enable $65,000+ monthly recurring revenue through warehouse partnerships
- **Market Position**: Become the leading B2B warehouse marketplace platform
- **User Experience**: Provide seamless, role-appropriate interfaces for each user type

### 1.3 Success Metrics
- **User Adoption**: 1,000+ registered users within 6 months
- **Platform Utilization**: 85% monthly active user rate
- **Security Compliance**: 100% SOC 2 Type II compliance
- **Performance**: 99.9% uptime with <200ms response times

---

## 2. User Personas & Roles

### 2.1 Super Admin (Platform Administrator)
**Primary Responsibilities:**
- Platform operations and maintenance
- Partner onboarding and management
- Financial oversight and revenue tracking
- Security and compliance management
- System configuration and feature deployment

**Access Level:** Full platform control
**Technical Profile:** High technical proficiency
**Usage Patterns:** Daily platform monitoring, weekly strategic reviews
**Pain Points:** Need comprehensive dashboards, automated reporting, efficient partner management

**Core Features Required:**
- Platform-wide analytics dashboard
- Partner approval and management workflows
- Financial reporting and commission tracking
- Security audit and compliance tools
- User management and role assignment
- System configuration and feature flags

### 2.2 Warehouse Operator (Facility Manager)
**Primary Responsibilities:**
- Facility management and operations
- Inventory tracking and space allocation
- Customer communication and support
- Order fulfillment and logistics coordination
- Performance monitoring and reporting

**Access Level:** Facility-specific administrative control
**Technical Profile:** Moderate technical proficiency
**Usage Patterns:** Daily operations management, real-time monitoring
**Pain Points:** Need efficient inventory management, clear customer communication, performance insights

**Core Features Required:**
- Warehouse-specific dashboard
- Inventory management system
- Customer communication tools
- Order processing workflows
- Performance analytics
- Space utilization optimization
- Integration with WMS systems

### 2.3 Business Customer (Storage Renter)
**Primary Responsibilities:**
- Inventory planning and management
- Storage space booking and management
- Order processing and fulfillment
- Cost optimization and reporting
- Vendor relationship management

**Access Level:** Company-specific data and operations
**Technical Profile:** Moderate technical proficiency
**Usage Patterns:** Regular inventory management, periodic strategic planning
**Pain Points:** Need cost visibility, efficient space utilization, reliable fulfillment

**Core Features Required:**
- Company inventory dashboard
- Storage space booking system
- Cost tracking and optimization
- Order management and tracking
- Vendor performance monitoring
- Integration with business systems
- Reporting and analytics

### 2.4 End Customer (Consumer)
**Primary Responsibilities:**
- Product discovery and comparison
- Order placement and tracking
- Account management
- Support requests and communication

**Access Level:** Personal account and order data
**Technical Profile:** Basic to moderate technical proficiency
**Usage Patterns:** Occasional purchases, order tracking
**Pain Points:** Need easy discovery, reliable delivery, transparent tracking

**Core Features Required:**
- Product catalog and search
- Shopping cart and checkout
- Order tracking and history
- Account management
- Customer support interface
- Mobile-responsive design
- Payment processing

---

## 3. Feature Requirements

### 3.1 Authentication System

#### 3.1.1 Core Authentication Features
**Multi-Factor Authentication (MFA)**
- SMS-based verification
- Email verification
- Authenticator app support (Google Authenticator, Authy)
- Backup codes for account recovery

**OAuth2 Integration**
- Google Sign-In for business accounts
- Microsoft Azure AD for enterprise customers
- GitHub integration for technical users
- Custom OAuth provider support

**Session Management**
- JWT token-based authentication
- Refresh token rotation
- Session timeout configuration (role-based)
- Concurrent session limits
- Device management and tracking

**Password Policy**
- Minimum 12 characters with complexity requirements
- Password history (prevent reuse of last 12 passwords)
- Password expiration (90 days for admin roles)
- Account lockout after 5 failed attempts
- Password reset via email with time-limited tokens

#### 3.1.2 Security Features
**Audit Logging**
- Complete authentication event tracking
- Failed login attempt monitoring
- Permission change logging
- Data access audit trails
- Real-time security alert system

**Risk Management**
- Geolocation-based access controls
- Device fingerprinting
- Behavioral analytics for anomaly detection
- Rate limiting and DDoS protection
- Suspicious activity flagging

### 3.2 Role Management System

#### 3.2.1 Role-Based Access Control (RBAC)
**Permission Hierarchy**
```
Super Admin
├── Platform Management
├── Financial Access
├── User Management
└── System Configuration

Warehouse Operator
├── Facility Management
├── Inventory Control
├── Customer Communication
└── Order Processing

Business Customer
├── Company Data Access
├── Inventory Management
├── Booking Management
└── Reporting Access

End Customer
├── Personal Data Access
├── Order Management
└── Support Access
```

**Dynamic Role Assignment**
- Temporary role elevation
- Role inheritance for complex organizations
- Time-limited access grants
- Approval workflows for role changes

#### 3.2.2 Multi-Tenancy Architecture
**Data Isolation**
- Tenant-specific data partitioning
- Cross-tenant data access controls
- Shared resource management
- Tenant configuration customization

**Organization Hierarchy**
- Parent-child organization relationships
- Cascading permissions
- Cross-organization collaboration controls
- Resource sharing agreements

### 3.3 User Management Features

#### 3.3.1 User Onboarding
**Registration Workflows**
- Role-specific registration forms
- Email verification requirements
- Company verification for business accounts
- Admin approval processes
- Welcome email sequences

**Profile Management**
- Comprehensive user profiles
- Company information management
- Contact information validation
- Profile completion tracking
- Data privacy controls

#### 3.3.2 Account Management
**Self-Service Features**
- Password reset functionality
- Profile updates and maintenance
- Notification preferences
- Privacy settings management
- Account deactivation requests

**Administrative Controls**
- Bulk user import/export
- Account suspension and restoration
- Force password reset
- Account merge capabilities
- Data export for compliance

---

## 4. Technical Requirements

### 4.1 NextAuth.js Implementation

#### 4.1.1 Configuration Requirements
**Provider Setup**
```typescript
// Required providers configuration
providers: [
  EmailProvider(),
  GoogleProvider(),
  AzureADProvider(),
  CredentialsProvider(), // For custom authentication
]
```

**Session Strategy**
- JWT strategy for stateless authentication
- Database sessions for enhanced security (admin roles)
- Custom session callback for role injection
- Secure cookie configuration

**Security Configuration**
```typescript
// Enhanced security settings
security: {
  cookiePolicy: 'strict',
  secureCookies: true,
  sameSiteCookies: 'strict',
  signInRateLimit: 5, // attempts per minute
}
```

#### 4.1.2 Custom Authentication Flows
**Multi-Step Registration**
- Email verification step
- Profile completion step
- Role verification step
- Organization assignment step

**Progressive Enhancement**
- Basic email/password authentication
- OAuth provider linking
- MFA enrollment
- Advanced security features

### 4.2 Database Design

#### 4.2.1 Core Authentication Tables
```sql
-- User Management
Users {
  id: UUID PRIMARY KEY
  email: VARCHAR(255) UNIQUE NOT NULL
  emailVerified: TIMESTAMP
  name: VARCHAR(255)
  image: VARCHAR(500)
  passwordHash: VARCHAR(255)
  role: ENUM('super_admin', 'warehouse_operator', 'business_customer', 'end_customer')
  organizationId: UUID REFERENCES Organizations(id)
  isActive: BOOLEAN DEFAULT true
  lastLogin: TIMESTAMP
  mfaEnabled: BOOLEAN DEFAULT false
  mfaSecret: VARCHAR(255) ENCRYPTED
  createdAt: TIMESTAMP DEFAULT NOW()
  updatedAt: TIMESTAMP DEFAULT NOW()
}

-- Organization Management
Organizations {
  id: UUID PRIMARY KEY
  name: VARCHAR(255) NOT NULL
  type: ENUM('platform', 'warehouse', 'business', 'customer')
  parentId: UUID REFERENCES Organizations(id)
  settings: JSONB
  isActive: BOOLEAN DEFAULT true
  createdAt: TIMESTAMP DEFAULT NOW()
  updatedAt: TIMESTAMP DEFAULT NOW()
}

-- Role Permissions
Permissions {
  id: UUID PRIMARY KEY
  resource: VARCHAR(255) NOT NULL
  action: VARCHAR(100) NOT NULL
  conditions: JSONB
}

RolePermissions {
  roleType: ENUM('super_admin', 'warehouse_operator', 'business_customer', 'end_customer')
  permissionId: UUID REFERENCES Permissions(id)
  PRIMARY KEY (roleType, permissionId)
}

-- Session Management
UserSessions {
  id: UUID PRIMARY KEY
  userId: UUID REFERENCES Users(id) ON DELETE CASCADE
  sessionToken: VARCHAR(255) UNIQUE NOT NULL
  accessToken: VARCHAR(255)
  refreshToken: VARCHAR(255)
  expiresAt: TIMESTAMP NOT NULL
  createdAt: TIMESTAMP DEFAULT NOW()
  deviceInfo: JSONB
  ipAddress: INET
}

-- Audit Logging
AuditLogs {
  id: UUID PRIMARY KEY
  userId: UUID REFERENCES Users(id)
  action: VARCHAR(255) NOT NULL
  resource: VARCHAR(255)
  details: JSONB
  ipAddress: INET
  userAgent: TEXT
  timestamp: TIMESTAMP DEFAULT NOW()
}
```

#### 4.2.2 Business Logic Tables
```sql
-- Warehouse Management
Warehouses {
  id: UUID PRIMARY KEY
  organizationId: UUID REFERENCES Organizations(id)
  name: VARCHAR(255) NOT NULL
  address: TEXT
  capacity: INTEGER
  availableSpace: INTEGER
  operatorId: UUID REFERENCES Users(id)
  settings: JSONB
  isActive: BOOLEAN DEFAULT true
  createdAt: TIMESTAMP DEFAULT NOW()
}

-- Customer Storage
StorageAgreements {
  id: UUID PRIMARY KEY
  warehouseId: UUID REFERENCES Warehouses(id)
  customerId: UUID REFERENCES Users(id)
  businessId: UUID REFERENCES Organizations(id)
  spaceAllocated: INTEGER
  monthlyRate: DECIMAL(10,2)
  startDate: DATE
  endDate: DATE
  status: ENUM('active', 'pending', 'expired', 'cancelled')
  terms: JSONB
}

-- Inventory Management
InventoryItems {
  id: UUID PRIMARY KEY
  warehouseId: UUID REFERENCES Warehouses(id)
  businessId: UUID REFERENCES Organizations(id)
  sku: VARCHAR(100) NOT NULL
  name: VARCHAR(255)
  category: VARCHAR(100)
  quantity: INTEGER
  location: VARCHAR(100)
  metadata: JSONB
  createdAt: TIMESTAMP DEFAULT NOW()
  updatedAt: TIMESTAMP DEFAULT NOW()
}
```

### 4.3 Security Implementation

#### 4.3.1 Encryption and Data Protection
**Data Encryption**
- AES-256 encryption for sensitive data at rest
- TLS 1.3 for data in transit
- Field-level encryption for PII
- Encrypted database backups

**Key Management**
- AWS KMS integration for key rotation
- Separate keys for different data types
- Regular key rotation (quarterly)
- Secure key backup and recovery

#### 4.3.2 API Security
**Authentication Middleware**
```typescript
// JWT validation middleware
export const authenticateToken = (requiredRole?: UserRole) => {
  return async (req: AuthenticatedRequest, res: NextApiResponse, next: NextFunction) => {
    try {
      const token = extractTokenFromHeader(req);
      const decoded = verifyJWT(token);
      const user = await getUserById(decoded.userId);

      if (!user || !user.isActive) {
        throw new Error('Invalid user');
      }

      if (requiredRole && !hasRequiredRole(user.role, requiredRole)) {
        throw new Error('Insufficient permissions');
      }

      req.user = user;
      next();
    } catch (error) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  };
};
```

**Rate Limiting**
```typescript
// API rate limiting configuration
const rateLimits = {
  login: { windowMs: 15 * 60 * 1000, max: 5 }, // 5 attempts per 15 minutes
  registration: { windowMs: 60 * 60 * 1000, max: 3 }, // 3 attempts per hour
  api: { windowMs: 15 * 60 * 1000, max: 1000 }, // 1000 requests per 15 minutes
  sensitive: { windowMs: 60 * 60 * 1000, max: 10 }, // 10 requests per hour
};
```

### 4.4 Performance Requirements

#### 4.4.1 Response Time Targets
- **Authentication API**: <100ms response time
- **User Dashboard Load**: <500ms initial load
- **Database Queries**: <50ms average query time
- **File Upload/Download**: <2 seconds for 10MB files

#### 4.4.2 Scalability Requirements
- **Concurrent Users**: Support 10,000 simultaneous users
- **Database Connections**: Optimized connection pooling
- **CDN Integration**: Global content delivery
- **Auto-scaling**: Kubernetes-based horizontal scaling

---

## 5. Success Metrics & KPIs

### 5.1 User Adoption Metrics

#### 5.1.1 Registration and Activation
**Primary Metrics**
- **New User Registrations**: 100+ per month by month 3
- **Email Verification Rate**: >95% within 24 hours
- **Profile Completion Rate**: >90% for business users
- **First Login Success Rate**: >98%

**Secondary Metrics**
- **Registration Drop-off Rate**: <10% at each step
- **Account Activation Time**: <30 minutes average
- **Role Assignment Accuracy**: >99%

#### 5.1.2 User Engagement
**Daily Active Users (DAU)**
- Super Admins: 100% (all registered admins)
- Warehouse Operators: >80% of registered operators
- Business Customers: >60% of registered businesses
- End Customers: >30% of registered consumers

**Session Metrics**
- Average session duration: >10 minutes for business users
- Pages per session: >5 for active users
- Bounce rate: <15% for authenticated users

### 5.2 Security Metrics

#### 5.2.1 Authentication Security
**Security Compliance**
- **MFA Adoption Rate**: >90% for admin roles, >70% for business users
- **Password Policy Compliance**: 100% enforcement
- **Failed Login Attempts**: <1% of total login attempts
- **Account Compromise Incidents**: 0 per quarter

**Performance Security**
- **Authentication Response Time**: <100ms for 95% of requests
- **Token Validation Time**: <10ms average
- **Session Timeout Compliance**: 100% enforcement

#### 5.2.2 Audit and Compliance
**Audit Trail Completeness**
- **Event Logging Coverage**: 100% of security-relevant events
- **Log Retention Compliance**: Meet regulatory requirements
- **Audit Query Performance**: <1 second for standard queries

### 5.3 Business Impact Metrics

#### 5.3.1 Revenue Metrics
**Platform Revenue**
- **Monthly Recurring Revenue (MRR)**: Target $65,000 by month 6
- **Average Revenue Per User (ARPU)**: Track by user segment
- **Customer Lifetime Value (CLV)**: Optimize by persona

**Operational Efficiency**
- **User Support Tickets**: <5% of active users per month
- **Authentication-related Issues**: <1% of total support tickets
- **Account Recovery Requests**: <2% of active users per month

#### 5.3.2 Platform Utilization
**Feature Adoption**
- **Dashboard Usage**: >80% weekly active rate for business users
- **Mobile App Usage**: >40% of end customers
- **API Integration**: 100% of warehouse operators

**System Performance**
- **Platform Uptime**: 99.9% availability
- **Response Time SLA**: 95% of requests under target times
- **Error Rate**: <0.1% for authenticated requests

### 5.4 User Satisfaction Metrics

#### 5.4.1 Usability Metrics
**User Experience Scores**
- **Net Promoter Score (NPS)**: Target >50 for each persona
- **Customer Satisfaction (CSAT)**: Target >4.5/5.0
- **System Usability Scale (SUS)**: Target >80 for all interfaces

**Support and Training**
- **Self-Service Success Rate**: >80% for common tasks
- **Training Completion Rate**: >95% for required training
- **User Onboarding Time**: <30 minutes for basic setup

#### 5.4.2 Feedback and Improvement
**Continuous Improvement**
- **Feature Request Implementation**: >60% of top-requested features
- **Bug Fix Response Time**: <24 hours for critical issues
- **User Feedback Response Rate**: >95% acknowledgment within 48 hours

---

## 6. Risk Assessment & Mitigation

### 6.1 Security Risks

#### 6.1.1 High-Priority Risks
**Data Breach Risk**
- **Impact**: High - Customer data exposure, compliance violations
- **Probability**: Medium
- **Mitigation**: End-to-end encryption, regular security audits, incident response plan

**Account Takeover Risk**
- **Impact**: High - Unauthorized access to sensitive business data
- **Probability**: Medium
- **Mitigation**: MFA enforcement, behavioral analytics, session monitoring

#### 6.1.2 Medium-Priority Risks
**DDoS Attack Risk**
- **Impact**: Medium - Service disruption
- **Probability**: Medium
- **Mitigation**: CDN protection, rate limiting, auto-scaling infrastructure

**Insider Threat Risk**
- **Impact**: High - Privileged access abuse
- **Probability**: Low
- **Mitigation**: Principle of least privilege, audit logging, background checks

### 6.2 Technical Risks

#### 6.2.1 Performance Risks
**Database Performance Degradation**
- **Impact**: Medium - Slow response times, user frustration
- **Probability**: Medium
- **Mitigation**: Database optimization, caching layers, monitoring

**Third-Party Service Outages**
- **Impact**: Medium - Authentication service disruption
- **Probability**: Low
- **Mitigation**: Multiple providers, graceful degradation, backup systems

#### 6.2.2 Integration Risks
**API Integration Failures**
- **Impact**: Medium - Reduced functionality for warehouse operators
- **Probability**: Medium
- **Mitigation**: Robust error handling, fallback mechanisms, comprehensive testing

---

## 7. Implementation Timeline

### 7.1 Phase 1: Foundation (Weeks 1-4)
**Core Authentication System**
- [ ] NextAuth.js setup and configuration
- [ ] Database schema implementation
- [ ] Basic user registration and login
- [ ] Email verification system
- [ ] Password reset functionality

**Security Foundations**
- [ ] JWT token implementation
- [ ] Rate limiting setup
- [ ] Basic audit logging
- [ ] HTTPS/TLS configuration
- [ ] Security headers implementation

### 7.2 Phase 2: Role Management (Weeks 5-8)
**RBAC Implementation**
- [ ] Role-based permission system
- [ ] Multi-tenancy architecture
- [ ] Organization management
- [ ] Permission inheritance
- [ ] Admin role assignment

**User Management Features**
- [ ] User profile management
- [ ] Bulk user operations
- [ ] Account status management
- [ ] User search and filtering
- [ ] Data export capabilities

### 7.3 Phase 3: Advanced Security (Weeks 9-12)
**Multi-Factor Authentication**
- [ ] MFA setup and enrollment
- [ ] SMS/Email verification
- [ ] Authenticator app support
- [ ] Backup codes generation
- [ ] MFA policy enforcement

**Enhanced Security Features**
- [ ] Session management improvements
- [ ] Behavioral analytics implementation
- [ ] Advanced audit logging
- [ ] Risk-based authentication
- [ ] Compliance reporting

### 7.4 Phase 4: Integration & Optimization (Weeks 13-16)
**Business System Integration**
- [ ] Warehouse management integration
- [ ] Payment processing integration
- [ ] External API integrations
- [ ] Mobile app authentication
- [ ] SSO implementation

**Performance Optimization**
- [ ] Database performance tuning
- [ ] Caching implementation
- [ ] CDN integration
- [ ] Auto-scaling configuration
- [ ] Monitoring and alerting

---

## 8. Acceptance Criteria

### 8.1 Functional Requirements Validation

#### 8.1.1 Authentication Features
**User Registration**
- [ ] Users can register with email/password
- [ ] Email verification is required and functional
- [ ] Registration form validation works correctly
- [ ] Welcome email is sent upon successful registration
- [ ] Role assignment works during registration

**User Login**
- [ ] Users can login with verified credentials
- [ ] Failed login attempts are tracked and limited
- [ ] Password reset functionality works end-to-end
- [ ] OAuth providers work for supported roles
- [ ] Session management maintains security

#### 8.1.2 Role Management
**Permission System**
- [ ] Role-based access control functions correctly
- [ ] Users only see permitted features and data
- [ ] Permission inheritance works for organizations
- [ ] Admin can modify user roles and permissions
- [ ] Audit log tracks all permission changes

**Multi-tenancy**
- [ ] Data isolation prevents cross-tenant access
- [ ] Organization hierarchy functions correctly
- [ ] Shared resources are properly controlled
- [ ] Tenant configuration works independently

### 8.2 Security Requirements Validation

#### 8.2.1 Security Controls
**Authentication Security**
- [ ] MFA enrollment and verification works
- [ ] Session tokens are secure and properly validated
- [ ] Password policies are enforced
- [ ] Account lockout functions correctly
- [ ] Audit logging captures all security events

**Data Protection**
- [ ] Sensitive data is encrypted at rest
- [ ] All communications use TLS encryption
- [ ] PII is properly masked in logs
- [ ] Data export/deletion complies with privacy laws
- [ ] Backup systems maintain encryption

### 8.3 Performance Requirements Validation

#### 8.3.1 Performance Benchmarks
**Response Times**
- [ ] Authentication API responds within 100ms
- [ ] Dashboard loads within 500ms
- [ ] Database queries average under 50ms
- [ ] File operations complete within SLA

**Scalability**
- [ ] System handles 10,000 concurrent users
- [ ] Auto-scaling functions under load
- [ ] Database performance remains stable
- [ ] CDN reduces global latency

### 8.4 Business Requirements Validation

#### 8.4.1 User Experience
**Persona-Specific Interfaces**
- [ ] Each user type sees appropriate dashboard
- [ ] Navigation is intuitive for each persona
- [ ] Features are accessible and functional
- [ ] Mobile experience is responsive
- [ ] Error messages are clear and helpful

**Business Process Support**
- [ ] Warehouse onboarding process works end-to-end
- [ ] Customer registration supports business verification
- [ ] Admin workflows are efficient and complete
- [ ] Integration points function correctly
- [ ] Reporting provides required insights

---

## 9. Post-Launch Monitoring

### 9.1 Operational Monitoring

#### 9.1.1 System Health
**Core Metrics Tracking**
- Authentication service uptime and response times
- Database performance and connection health
- API endpoint availability and error rates
- Security event monitoring and alerting
- User session quality and duration

**Automated Alerting**
- Critical system failures (immediate notification)
- Performance degradation (5-minute threshold)
- Security incidents (real-time alerts)
- Capacity thresholds (proactive scaling)
- Business metric anomalies (hourly monitoring)

#### 9.1.2 User Experience Monitoring
**User Journey Analytics**
- Registration completion rates by persona
- Login success rates and failure reasons
- Feature adoption tracking by user type
- Support ticket categorization and resolution
- User feedback sentiment analysis

### 9.2 Continuous Improvement

#### 9.2.1 Performance Optimization
**Regular Review Cycles**
- Weekly performance reviews
- Monthly security audits
- Quarterly user experience assessments
- Annual architecture reviews

**Optimization Priorities**
- Database query optimization
- Authentication flow improvements
- User interface enhancements
- Security posture strengthening
- Integration reliability improvements

---

## 10. Conclusion

This Product Requirements Document provides a comprehensive roadmap for implementing a secure, scalable, and user-friendly authentication and persona-based SaaS system for skidspace.com. The requirements address the needs of all four user personas while maintaining security, performance, and usability standards.

The implementation plan spans 16 weeks with clear phases and deliverables. Success will be measured through specific KPIs focusing on user adoption, security compliance, system performance, and business impact.

Regular monitoring and continuous improvement processes ensure the system evolves with user needs and maintains industry-leading security and performance standards.

---

**Document Approval:**
- [ ] Product Owner Review
- [ ] Engineering Team Review
- [ ] Security Team Review
- [ ] Business Stakeholder Review
- [ ] Legal and Compliance Review

**Next Steps:**
1. Stakeholder review and approval
2. Technical architecture deep dive
3. Development team sprint planning
4. Security framework implementation
5. User interface design and prototyping

*This document serves as the single source of truth for the skidspace.com authentication and SaaS system requirements and will be updated as the product evolves.*