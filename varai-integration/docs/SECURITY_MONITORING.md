# VARAi Platform - Security Monitoring & Incident Response

## 8. SECURITY MONITORING & ALERTING

### Structured Logging

```typescript
// packages/logging/src/logger.ts
import winston from 'winston';
import { LoggingWinston } from '@google-cloud/logging-winston';

const loggingWinston = new LoggingWinston({
  projectId: process.env.GCP_PROJECT_ID,
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: process.env.SERVICE_NAME,
    environment: process.env.NODE_ENV,
    version: process.env.APP_VERSION,
  },
  transports: [new winston.transports.Console(), loggingWinston],
});

// Security event logger
export class SecurityLogger {
  static logAuthEvent(event: {
    type: 'LOGIN' | 'LOGOUT' | 'MFA_VERIFY' | 'PASSWORD_RESET' | 'TOKEN_REFRESH';
    userId?: string;
    success: boolean;
    ipAddress: string;
    userAgent: string;
    reason?: string;
  }) {
    logger.info('Security Event: Authentication', {
      securityEvent: 'auth',
      ...event,
      timestamp: new Date().toISOString(),
    });
  }

  static logAccessEvent(event: {
    userId: string;
    resource: string;
    action: 'READ' | 'WRITE' | 'DELETE';
    granted: boolean;
    reason?: string;
  }) {
    logger.info('Security Event: Access Control', {
      securityEvent: 'access',
      ...event,
      timestamp: new Date().toISOString(),
    });
  }

  static logSecurityIncident(incident: {
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    type: string;
    description: string;
    userId?: string;
    ipAddress?: string;
    affectedResources?: string[];
  }) {
    logger.warn('Security Incident Detected', {
      securityEvent: 'incident',
      ...incident,
      timestamp: new Date().toISOString(),
    });

    // Auto-escalate critical incidents
    if (incident.severity === 'CRITICAL') {
      this.alertSecurityTeam(incident);
    }
  }

  private static async alertSecurityTeam(incident: any) {
    // Send to PagerDuty/OpsGenie
    // Send Slack notification
    // Create JIRA ticket
  }
}
```

### Real-time Threat Detection

```typescript
// packages/security/src/threat-detection.ts
import { Redis } from 'ioredis';
import { SecurityLogger } from '@varai/logging';

export class ThreatDetector {
  private redis: Redis;

  // Detect brute force attacks
  async detectBruteForce(identifier: string): Promise<boolean> {
    const key = `bruteforce:${identifier}`;
    const attempts = await this.redis.incr(key);

    if (attempts === 1) {
      await this.redis.expire(key, 300); // 5 minute window
    }

    if (attempts > 5) {
      SecurityLogger.logSecurityIncident({
        severity: 'HIGH',
        type: 'BRUTE_FORCE_ATTACK',
        description: `Brute force attack detected from ${identifier}`,
        ipAddress: identifier,
      });
      return true;
    }

    return false;
  }

  // Detect credential stuffing
  async detectCredentialStuffing(email: string, ipAddress: string): Promise<boolean> {
    const key = `credstuff:${ipAddress}`;
    const emails = await this.redis.sadd(key, email);

    if (emails === 1) {
      await this.redis.expire(key, 3600); // 1 hour window
    }

    const uniqueEmails = await this.redis.scard(key);

    if (uniqueEmails > 10) {
      SecurityLogger.logSecurityIncident({
        severity: 'CRITICAL',
        type: 'CREDENTIAL_STUFFING',
        description: `Credential stuffing attack detected from ${ipAddress}`,
        ipAddress,
        affectedResources: [email],
      });
      return true;
    }

    return false;
  }

  // Detect anomalous behavior
  async detectAnomalousAccess(
    userId: string,
    context: {
      ipAddress: string;
      userAgent: string;
      location?: string;
    }
  ): Promise<boolean> {
    // Check for impossible travel
    const lastAccess = await this.redis.hgetall(`user:${userId}:last_access`);

    if (lastAccess.location && context.location) {
      const distance = calculateDistance(lastAccess.location, context.location);
      const timeDiff = Date.now() - parseInt(lastAccess.timestamp);
      const speed = distance / (timeDiff / 3600000); // km/h

      if (speed > 900) {
        // Faster than commercial flight
        SecurityLogger.logSecurityIncident({
          severity: 'HIGH',
          type: 'IMPOSSIBLE_TRAVEL',
          description: `Impossible travel detected for user ${userId}`,
          userId,
          ipAddress: context.ipAddress,
        });
        return true;
      }
    }

    // Store current access
    await this.redis.hmset(`user:${userId}:last_access`, {
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      location: context.location || '',
      timestamp: Date.now().toString(),
    });
    await this.redis.expire(`user:${userId}:last_access`, 86400); // 24 hours

    return false;
  }

  // Detect data exfiltration
  async detectDataExfiltration(userId: string, bytesDownloaded: number): Promise<boolean> {
    const key = `download:${userId}`;
    const total = await this.redis.incrby(key, bytesDownloaded);

    if (total === bytesDownloaded) {
      await this.redis.expire(key, 3600); // 1 hour window
    }

    const threshold = 1024 * 1024 * 1024; // 1GB per hour

    if (total > threshold) {
      SecurityLogger.logSecurityIncident({
        severity: 'HIGH',
        type: 'DATA_EXFILTRATION',
        description: `Unusual data download detected: ${total} bytes in 1 hour`,
        userId,
      });
      return true;
    }

    return false;
  }
}
```

### Alerting Rules

```typescript
// packages/monitoring/src/alerts.ts
import { Monitoring } from '@google-cloud/monitoring';

export class AlertManager {
  private client: Monitoring.AlertPolicyServiceClient;

  async createSecurityAlerts() {
    // Failed login alert
    await this.createAlert({
      displayName: 'High Failed Login Rate',
      conditions: [
        {
          displayName: 'Failed logins > 100 in 5 minutes',
          conditionThreshold: {
            filter: 'metric.type="custom.googleapis.com/auth/failed_logins"',
            comparison: 'COMPARISON_GT',
            thresholdValue: 100,
            duration: { seconds: 300 },
          },
        },
      ],
      notificationChannels: ['security-team-pagerduty'],
      severity: 'CRITICAL',
    });

    // Unauthorized access alert
    await this.createAlert({
      displayName: 'Unauthorized Access Attempts',
      conditions: [
        {
          displayName: '403 errors spike',
          conditionThreshold: {
            filter: 'metric.type="logging.googleapis.com/user/http_403_count"',
            comparison: 'COMPARISON_GT',
            thresholdValue: 50,
            duration: { seconds: 60 },
          },
        },
      ],
      notificationChannels: ['security-team-slack'],
      severity: 'HIGH',
    });

    // Abnormal database access
    await this.createAlert({
      displayName: 'Abnormal Database Query Volume',
      conditions: [
        {
          displayName: 'Query rate > 10000/min',
          conditionThreshold: {
            filter: 'metric.type="cloudsql.googleapis.com/database/queries"',
            comparison: 'COMPARISON_GT',
            thresholdValue: 10000,
            duration: { seconds: 60 },
          },
        },
      ],
      notificationChannels: ['dba-team-slack'],
      severity: 'HIGH',
    });
  }
}
```

### Security Dashboards

```typescript
// packages/monitoring/src/dashboards.ts
export const securityDashboard = {
  displayName: 'VARAi Security Dashboard',
  mosaicLayout: {
    columns: 12,
    tiles: [
      {
        width: 6,
        height: 4,
        widget: {
          title: 'Authentication Events',
          xyChart: {
            dataSets: [
              {
                timeSeriesQuery: {
                  timeSeriesFilter: {
                    filter: 'metric.type="custom.googleapis.com/auth/events"',
                    aggregation: {
                      alignmentPeriod: '60s',
                      perSeriesAligner: 'ALIGN_RATE',
                    },
                  },
                },
              },
            ],
          },
        },
      },
      {
        width: 6,
        height: 4,
        widget: {
          title: 'Failed Logins by IP',
          xyChart: {
            dataSets: [
              {
                timeSeriesQuery: {
                  timeSeriesFilter: {
                    filter: 'metric.type="custom.googleapis.com/auth/failed_logins"',
                    aggregation: {
                      alignmentPeriod: '300s',
                      perSeriesAligner: 'ALIGN_SUM',
                      groupByFields: ['metric.label.ip_address'],
                    },
                  },
                },
              },
            ],
          },
        },
      },
      {
        width: 4,
        height: 4,
        widget: {
          title: 'Active Sessions',
          scorecard: {
            timeSeriesQuery: {
              timeSeriesFilter: {
                filter: 'metric.type="custom.googleapis.com/auth/active_sessions"',
                aggregation: {
                  alignmentPeriod: '60s',
                  perSeriesAligner: 'ALIGN_MEAN',
                },
              },
            },
          },
        },
      },
      {
        width: 8,
        height: 4,
        widget: {
          title: 'Security Incidents',
          logsPanel: {
            resourceNames: [`projects/${PROJECT_ID}`],
            filter: 'jsonPayload.securityEvent="incident"',
          },
        },
      },
    ],
  },
};
```

---

## 9. INCIDENT RESPONSE

### Incident Response Playbook

```yaml
# docs/security/incident-response-playbook.yml
playbooks:
  - name: Account Compromise
    severity: CRITICAL
    triggers:
      - Impossible travel detected
      - Multiple failed MFA attempts
      - Suspicious API calls

    steps:
      - title: Immediate Response (0-5 minutes)
        actions:
          - Revoke all active sessions for the user
          - Disable user account temporarily
          - Force password reset
          - Notify security team via PagerDuty
          - Log all relevant events

      - title: Investigation (5-30 minutes)
        actions:
          - Review audit logs for compromised account
          - Identify accessed resources
          - Check for data exfiltration
          - Determine attack vector
          - Document timeline of events

      - title: Containment (30-60 minutes)
        actions:
          - Revoke any API keys created by compromised account
          - Review and revoke suspicious OAuth grants
          - Check for privilege escalation
          - Scan for backdoors or persistence mechanisms

      - title: Recovery (1-4 hours)
        actions:
          - Contact user via verified secondary channel
          - Verify user identity through multi-factor
          - Reset credentials securely
          - Re-enable account with monitoring
          - Provide security guidance to user

      - title: Post-Incident (4-24 hours)
        actions:
          - Complete incident report
          - Update threat intelligence
          - Improve detection rules
          - Update security training
          - Notify affected parties if needed

  - name: Data Breach
    severity: CRITICAL
    triggers:
      - Unusual data export volume
      - Unauthorized database access
      - Public exposure of sensitive data

    steps:
      - title: Immediate Response (0-15 minutes)
        actions:
          - Stop the breach - block access vectors
          - Preserve evidence - snapshot systems
          - Notify CISO and legal team
          - Activate incident response team

      - title: Assessment (15-60 minutes)
        actions:
          - Identify scope of breach
          - Determine data types compromised
          - Count affected users/records
          - Assess business impact
          - Document evidence chain

      - title: Containment (1-4 hours)
        actions:
          - Isolate affected systems
          - Revoke compromised credentials
          - Apply emergency patches
          - Enable additional monitoring

      - title: Notification (4-72 hours)
        actions:
          - Notify affected users (GDPR: 72 hours)
          - Report to regulators if required
          - Prepare public statement
          - Coordinate with PR team

      - title: Recovery (Days-Weeks)
        actions:
          - Restore from clean backups
          - Implement additional controls
          - Update security policies
          - Conduct security audit
          - Offer credit monitoring if needed

  - name: DDoS Attack
    severity: HIGH
    triggers:
      - Traffic spike > 10x normal
      - High error rate (503, 504)
      - Cloud Armor rate limit triggers

    steps:
      - title: Detection (0-5 minutes)
        actions:
          - Confirm attack vs legitimate traffic spike
          - Identify attack vectors (L3, L4, L7)
          - Document attack characteristics

      - title: Mitigation (5-15 minutes)
        actions:
          - Enable Cloud Armor strict mode
          - Increase rate limits for legitimate users
          - Scale infrastructure automatically
          - Contact GCP support for additional DDoS protection

      - title: Monitoring (Duration of attack)
        actions:
          - Track attack metrics
          - Adjust defenses as needed
          - Communicate with stakeholders

      - title: Post-Attack (After mitigation)
        actions:
          - Analyze attack patterns
          - Update Cloud Armor rules
          - Improve auto-scaling policies
          - Document lessons learned
```

### Incident Response Scripts

```typescript
// scripts/incident-response.ts
import { SecurityLogger } from '@varai/logging';
import { JWTService, TokenRevocation } from '@varai/auth';

export class IncidentResponse {
  // Revoke all sessions for a user
  async revokeUserSessions(userId: string, reason: string) {
    console.log(`🚨 Revoking all sessions for user ${userId}`);

    // Get all active refresh tokens
    const tokens = await prisma.refreshToken.findMany({
      where: { userId, revoked: false },
    });

    // Revoke each token
    for (const token of tokens) {
      await TokenRevocation.revoke(token.jti, token.expiresAt.getTime());
      await prisma.refreshToken.update({
        where: { id: token.id },
        data: { revoked: true, revokedReason: reason },
      });
    }

    SecurityLogger.logSecurityIncident({
      severity: 'HIGH',
      type: 'SESSION_REVOCATION',
      description: `All sessions revoked for user ${userId}`,
      userId,
      affectedResources: tokens.map((t) => t.jti),
    });

    console.log(`✅ Revoked ${tokens.length} sessions`);
  }

  // Lock user account
  async lockAccount(userId: string, reason: string, duration?: number) {
    console.log(`🔒 Locking account ${userId}`);

    const lockUntil = duration ? new Date(Date.now() + duration) : new Date('2099-12-31'); // Indefinite

    await prisma.user.update({
      where: { id: userId },
      data: {
        locked: true,
        lockedUntil: lockUntil,
        lockedReason: reason,
      },
    });

    // Revoke all sessions
    await this.revokeUserSessions(userId, reason);

    // Send notification to user
    await this.notifyUserAccountLocked(userId, reason);

    SecurityLogger.logSecurityIncident({
      severity: 'HIGH',
      type: 'ACCOUNT_LOCKED',
      description: `Account locked: ${reason}`,
      userId,
    });

    console.log(`✅ Account locked until ${lockUntil}`);
  }

  // Quarantine suspicious data
  async quarantineData(resourceId: string, resourceType: string) {
    console.log(`🔐 Quarantining ${resourceType} ${resourceId}`);

    await prisma.quarantinedResource.create({
      data: {
        resourceId,
        resourceType,
        quarantinedAt: new Date(),
        reason: 'Security incident investigation',
      },
    });

    SecurityLogger.logSecurityIncident({
      severity: 'MEDIUM',
      type: 'DATA_QUARANTINE',
      description: `Resource quarantined for investigation`,
      affectedResources: [resourceId],
    });

    console.log(`✅ Resource quarantined`);
  }

  // Emergency circuit breaker
  async enableCircuitBreaker(service: string, reason: string) {
    console.log(`⚠️  Enabling circuit breaker for ${service}`);

    await redis.setex(`circuit_breaker:${service}`, 3600, reason);

    SecurityLogger.logSecurityIncident({
      severity: 'CRITICAL',
      type: 'CIRCUIT_BREAKER_ACTIVATED',
      description: `Circuit breaker enabled: ${reason}`,
      affectedResources: [service],
    });

    // Notify team
    await this.notifySecurityTeam({
      title: `Circuit Breaker Activated: ${service}`,
      message: reason,
      severity: 'CRITICAL',
    });

    console.log(`✅ Circuit breaker enabled`);
  }

  // Snapshot system for forensics
  async createForensicSnapshot(instanceId: string) {
    console.log(`📸 Creating forensic snapshot of ${instanceId}`);

    // Create GCE snapshot
    const compute = new Compute();
    const disk = compute.zone('us-central1-a').disk(instanceId);

    const [operation] = await disk.createSnapshot(`forensic-${Date.now()}`);
    await operation.promise();

    SecurityLogger.logSecurityIncident({
      severity: 'HIGH',
      type: 'FORENSIC_SNAPSHOT',
      description: `Forensic snapshot created for investigation`,
      affectedResources: [instanceId],
    });

    console.log(`✅ Forensic snapshot created`);
  }
}

// CLI for incident response
if (require.main === module) {
  const ir = new IncidentResponse();

  const command = process.argv[2];
  const args = process.argv.slice(3);

  switch (command) {
    case 'revoke-sessions':
      ir.revokeUserSessions(args[0], args[1]);
      break;
    case 'lock-account':
      ir.lockAccount(args[0], args[1], args[2] ? parseInt(args[2]) : undefined);
      break;
    case 'circuit-breaker':
      ir.enableCircuitBreaker(args[0], args[1]);
      break;
    default:
      console.log('Unknown command');
  }
}
```

### Automated Response Actions

```typescript
// packages/security/src/auto-response.ts
import { ThreatDetector } from './threat-detection';
import { IncidentResponse } from './incident-response';

export class AutomatedResponse {
  private threatDetector: ThreatDetector;
  private incidentResponse: IncidentResponse;

  async handleAuthEvent(event: AuthEvent) {
    // Check for brute force
    const isBruteForce = await this.threatDetector.detectBruteForce(
      event.ipAddress
    );

    if (isBruteForce) {
      // Auto-block IP
      await this.blockIP(event.ipAddress, 3600); // 1 hour
      return;
    }

    // Check for credential stuffing
    const isCredStuffing = await this.threatDetector.detectCredentialStuffing(
      event.email,
      event.ipAddress
    );

    if (isCredStuffing) {
      // Auto-block IP + notify security team
      await this.blockIP(event.ipAddress, 86400); // 24 hours
      await this.incidentResponse.notifySecurityTeam({
        title: 'Credential Stuffing Attack Detected',
        message: `IP ${event.ipAddress} blocked automatically`,
        severity: 'CRITICAL'
      });
    }
  }

  async handleAccessEvent(event: AccessEvent) {
    // Check for anomalous access
    const isAnomalous = await this.threatDetector.detectAnomalousAccess(
      event.userId,
      {
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
        location: event.location
      }
    );

    if (isAnomalous) {
      // Require MFA step-up authentication
      await this.requireMFAStepUp(event.userId, event.sessionId);

      // Notify user
      await this.notifyUserSuspiciousActivity(event.userId);
    }
  }

  async handleDataAccess(event: DataAccessEvent) {
    // Check for data exfiltration
    const isExfiltration = await this.threatDetector.detectDataExfiltration(
      event.userId,
      event.bytesDownloaded
    );

    if (isExfiltration) {
      // Rate limit user
      await this.rateLimit User(event.userId, 60); // 1 minute timeout

      // Notify security team
      await this.incidentResponse.notifySecurityTeam({
        title: 'Potential Data Exfiltration',
        message: `User ${event.userId} downloaded ${event.bytesDownloaded} bytes`,
        severity: 'HIGH'
      });
    }
  }

  private async blockIP(ipAddress: string, duration: number) {
    // Add to Cloud Armor deny list
    // Or Redis-based IP blocking
    await redis.setex(`blocked_ip:${ipAddress}`, duration, '1');

    SecurityLogger.logSecurityIncident({
      severity: 'HIGH',
      type: 'IP_BLOCKED',
      description: `IP ${ipAddress} blocked for ${duration}s`,
      ipAddress
    });
  }
}
```

---

## 10. COMPLIANCE & AUDIT

### SOC 2 Controls Implementation

```typescript
// packages/compliance/src/soc2-controls.ts
export class SOC2Controls {
  // CC6.1: Logical Access Controls
  async enforceLogicalAccess() {
    // Ensure all access requires authentication
    // Implement RBAC
    // Log all access attempts
  }

  // CC6.2: Authentication
  async enforceAuthentication() {
    // Multi-factor authentication for admin accounts
    // Password complexity requirements
    // Account lockout after failed attempts
  }

  // CC6.3: Authorization
  async enforceAuthorization() {
    // Role-based access control
    // Principle of least privilege
    // Regular access reviews
  }

  // CC6.6: Logical Access - Removal
  async enforceAccessRemoval() {
    // Automated user deprovisioning
    // Access review on role changes
    // 90-day inactive account cleanup
  }

  // CC7.2: System Monitoring
  async enforceMonitoring() {
    // Real-time security event monitoring
    // Anomaly detection
    // Security incident alerting
  }

  // CC8.1: Change Management
  async enforceChangeManagement() {
    // All changes via pull requests
    // Code review requirements
    // Automated testing before deployment
  }
}
```

### GDPR Compliance

```typescript
// packages/compliance/src/gdpr.ts
export class GDPRCompliance {
  // Right to Access (Article 15)
  async exportUserData(userId: string): Promise<UserDataExport> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        orders: true,
        preferences: true,
        loginHistory: true,
      },
    });

    // Decrypt sensitive data
    const decryptedData = {
      ...user,
      // Decrypt PII fields
    };

    SecurityLogger.logAccessEvent({
      userId,
      resource: 'user_data_export',
      action: 'READ',
      granted: true,
    });

    return decryptedData;
  }

  // Right to Erasure (Article 17)
  async deleteUserData(userId: string, reason: string): Promise<void> {
    // Soft delete user
    await prisma.user.update({
      where: { id: userId },
      data: {
        deleted: true,
        deletedAt: new Date(),
        deletedReason: reason,
        // Anonymize PII
        email: `deleted_${userId}@anonymized.com`,
        name: 'Deleted User',
        phone: null,
      },
    });

    // Delete from backup after retention period
    await this.scheduleBackupDeletion(userId, 90); // 90 days

    SecurityLogger.logAccessEvent({
      userId,
      resource: 'user_data',
      action: 'DELETE',
      granted: true,
    });
  }

  // Data Breach Notification (Article 33)
  async notifyDataBreach(breach: DataBreach): Promise<void> {
    // Must notify within 72 hours
    const hoursSinceBreach = (Date.now() - breach.discoveredAt.getTime()) / 3600000;

    if (hoursSinceBreach > 72) {
      logger.error('GDPR violation: Breach notification > 72 hours');
    }

    // Notify supervisory authority
    await this.notifyAuthority(breach);

    // Notify affected data subjects if high risk
    if (breach.riskLevel === 'HIGH') {
      await this.notifyAffectedUsers(breach);
    }
  }
}
```

### Audit Reports

```typescript
// scripts/generate-audit-report.ts
import { format } from 'date-fns';

async function generateAuditReport(startDate: Date, endDate: Date) {
  console.log('📊 Generating audit report...');

  const report = {
    period: {
      start: format(startDate, 'yyyy-MM-dd'),
      end: format(endDate, 'yyyy-MM-dd'),
    },
    authEvents: await getAuthEvents(startDate, endDate),
    accessEvents: await getAccessEvents(startDate, endDate),
    dataChanges: await getDataChanges(startDate, endDate),
    securityIncidents: await getSecurityIncidents(startDate, endDate),
    complianceChecks: await runComplianceChecks(),
    userAccessReview: await getUserAccessReview(),
  };

  // Generate PDF report
  const pdf = await generatePDF(report);

  // Store in GCS
  await uploadToGCS(pdf, `audit-reports/${format(startDate, 'yyyy-MM')}.pdf`);

  console.log('✅ Audit report generated');
}

async function getAuthEvents(start: Date, end: Date) {
  return prisma.auditLog.groupBy({
    by: ['action'],
    where: {
      timestamp: { gte: start, lte: end },
      action: { in: ['LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT', 'MFA_VERIFY'] },
    },
    _count: true,
  });
}

async function getUserAccessReview() {
  // Review all user access levels
  const users = await prisma.user.findMany({
    include: { roles: true, permissions: true },
  });

  return users.map((user) => ({
    userId: user.id,
    email: user.email,
    roles: user.roles,
    lastLogin: user.lastLoginAt,
    inactive: user.lastLoginAt < new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    privileged: user.roles.some((r) => ['ADMIN', 'SUPERADMIN'].includes(r)),
  }));
}
```

This completes the comprehensive security architecture! Let me now create a final implementation checklist and summary document.
