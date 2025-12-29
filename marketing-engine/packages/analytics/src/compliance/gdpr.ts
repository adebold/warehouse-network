/**
 * GDPR compliance implementation
 */

import { Pool } from 'pg';
import crypto from 'crypto';
import { Logger } from '../core/logger';
import { GDPRRequest, UserProfile, AnalyticsEvent } from '../core/types';
import { AnalyticsRepository } from '../database/repository';

export interface GDPRManagerOptions {
  repository: AnalyticsRepository;
  pool: Pool;
  logger: Logger;
  encryptionKey: string;
}

export interface UserDataExport {
  profile: UserProfile | null;
  events: AnalyticsEvent[];
  conversions: any[];
  touchpoints: any[];
  exportedAt: Date;
}

export class GDPRManager {
  private readonly repository: AnalyticsRepository;
  private readonly pool: Pool;
  private readonly logger: Logger;
  private readonly encryptionKey: Buffer;

  constructor(options: GDPRManagerOptions) {
    this.repository = options.repository;
    this.pool = options.pool;
    this.logger = options.logger.child({ component: 'GDPRManager' });
    this.encryptionKey = Buffer.from(options.encryptionKey, 'base64');
  }

  /**
   * Process GDPR request
   */
  async processRequest(request: Omit<GDPRRequest, 'requestId' | 'requestedAt'>): Promise<string> {
    const requestId = await this.repository.createGDPRRequest(request);
    
    this.logger.info('GDPR request created', {
      requestId,
      userId: request.userId,
      type: request.type
    });

    // Process request asynchronously
    this.executeRequest(requestId, request).catch(error => {
      this.logger.error('Failed to execute GDPR request', error, {
        requestId
      });
    });

    return requestId;
  }

  /**
   * Execute GDPR request
   */
  private async executeRequest(
    requestId: string,
    request: Omit<GDPRRequest, 'requestId' | 'requestedAt'>
  ): Promise<void> {
    try {
      let result: any;

      switch (request.type) {
        case 'access':
          result = await this.handleAccessRequest(request.userId);
          break;
        case 'deletion':
          result = await this.handleDeletionRequest(request.userId);
          break;
        case 'portability':
          result = await this.handlePortabilityRequest(request.userId);
          break;
        case 'rectification':
          result = await this.handleRectificationRequest(
            request.userId,
            request.result?.updates
          );
          break;
        default:
          throw new Error(`Unknown request type: ${request.type}`);
      }

      // Update request status
      await this.updateRequestStatus(requestId, 'completed', result);
      
      this.logger.info('GDPR request completed', {
        requestId,
        type: request.type
      });
    } catch (error) {
      await this.updateRequestStatus(requestId, 'failed', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Handle data access request
   */
  private async handleAccessRequest(userId: string): Promise<UserDataExport> {
    const [profile, events] = await Promise.all([
      this.repository.getUserProfile(userId),
      this.repository.getEventsByUser(userId, 10000, 0)
    ]);

    // Get additional data
    const query = `
      SELECT 
        'conversions' as type,
        json_agg(c.*) as data
      FROM analytics.conversions c
      WHERE user_id = $1
      UNION ALL
      SELECT 
        'touchpoints' as type,
        json_agg(t.*) as data
      FROM analytics.attribution_touchpoints t
      WHERE user_id = $1
    `;

    const result = await this.pool.query(query, [userId]);
    
    const conversions = result.rows.find(r => r.type === 'conversions')?.data || [];
    const touchpoints = result.rows.find(r => r.type === 'touchpoints')?.data || [];

    return {
      profile,
      events,
      conversions,
      touchpoints,
      exportedAt: new Date()
    };
  }

  /**
   * Handle data deletion request
   */
  private async handleDeletionRequest(userId: string): Promise<any> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Delete from all tables
      const deletions = [
        'DELETE FROM analytics.attribution_credits WHERE touchpoint_id IN (SELECT touchpoint_id FROM analytics.attribution_touchpoints WHERE user_id = $1)',
        'DELETE FROM analytics.attribution_touchpoints WHERE user_id = $1',
        'DELETE FROM analytics.conversions WHERE user_id = $1',
        'DELETE FROM analytics.sessions WHERE user_id = $1',
        'DELETE FROM analytics.events WHERE user_id = $1',
        'DELETE FROM analytics.user_profiles WHERE user_id = $1'
      ];

      const results: any = {};
      for (const deletion of deletions) {
        const result = await client.query(deletion, [userId]);
        const tableName = deletion.match(/FROM ([\w\.]+)/)?.[1] || 'unknown';
        results[tableName] = result.rowCount;
      }

      await client.query('COMMIT');
      
      this.logger.info('User data deleted', {
        userId,
        ...results
      });

      return results;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Handle data portability request
   */
  private async handlePortabilityRequest(userId: string): Promise<any> {
    const data = await this.handleAccessRequest(userId);
    
    // Encrypt the export
    const jsonData = JSON.stringify(data, null, 2);
    const encrypted = this.encrypt(jsonData);
    
    // In production, this would upload to secure storage and return a download link
    return {
      format: 'json',
      encrypted: true,
      size: Buffer.byteLength(jsonData),
      checksum: crypto.createHash('sha256').update(jsonData).digest('hex'),
      data: encrypted.toString('base64')
    };
  }

  /**
   * Handle rectification request
   */
  private async handleRectificationRequest(
    userId: string,
    updates?: Record<string, any>
  ): Promise<any> {
    if (!updates) {
      throw new Error('No updates provided for rectification');
    }

    const profile = await this.repository.getUserProfile(userId);
    if (!profile) {
      throw new Error('User profile not found');
    }

    // Merge updates with existing traits
    const updatedProfile: UserProfile = {
      ...profile,
      traits: {
        ...profile.traits,
        ...updates
      },
      updatedAt: new Date()
    };

    await this.repository.saveUserProfile(updatedProfile);
    
    return {
      updated: Object.keys(updates),
      profile: updatedProfile
    };
  }

  /**
   * Update request status
   */
  private async updateRequestStatus(
    requestId: string,
    status: string,
    result?: any
  ): Promise<void> {
    const query = `
      UPDATE analytics.gdpr_requests
      SET 
        status = $2,
        completed_at = CASE WHEN $2 IN ('completed', 'failed') THEN NOW() ELSE NULL END,
        result = $3
      WHERE request_id = $1
    `;

    await this.pool.query(query, [
      requestId,
      status,
      JSON.stringify(result || {})
    ]);
  }

  /**
   * Encrypt data
   */
  private encrypt(data: string): Buffer {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      'aes-256-cbc',
      this.encryptionKey,
      iv
    );
    
    let encrypted = cipher.update(data, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    
    return Buffer.concat([iv, encrypted]);
  }

  /**
   * Decrypt data
   */
  private decrypt(encryptedData: Buffer): string {
    const iv = encryptedData.slice(0, 16);
    const encrypted = encryptedData.slice(16);
    
    const decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      this.encryptionKey,
      iv
    );
    
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted.toString('utf8');
  }

  /**
   * Anonymize user data
   */
  async anonymizeUserData(
    userId: string,
    options: {
      keepAggregates?: boolean;
      fieldsToKeep?: string[];
    } = {}
  ): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Anonymize events
      const anonymizeEventsQuery = `
        UPDATE analytics.events
        SET 
          user_id = NULL,
          properties = properties - 'email' - 'name' - 'phone' - 'address',
          context = jsonb_set(
            jsonb_set(context, '{ip}', '"0.0.0.0"'),
            '{userAgent}',
            '"Anonymized"'
          )
        WHERE user_id = $1
      `;

      await client.query(anonymizeEventsQuery, [userId]);

      // Anonymize user profile
      if (options.keepAggregates) {
        // Keep aggregated data but remove PII
        const anonymizeProfileQuery = `
          UPDATE analytics.user_profiles
          SET 
            user_id = 'anon_' || encode(digest(user_id, 'sha256'), 'hex'),
            traits = jsonb_strip_nulls(
              jsonb_build_object(
                'total_revenue', traits->'total_revenue',
                'event_count', traits->'event_count',
                'first_seen', traits->'first_seen',
                'last_seen', traits->'last_seen'
              )
            )
          WHERE user_id = $1
        `;

        await client.query(anonymizeProfileQuery, [userId]);
      } else {
        // Complete removal
        await client.query(
          'DELETE FROM analytics.user_profiles WHERE user_id = $1',
          [userId]
        );
      }

      await client.query('COMMIT');
      
      this.logger.info('User data anonymized', { userId });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get consent status
   */
  async getConsentStatus(userId: string): Promise<any> {
    const query = `
      SELECT 
        traits->'consent' as consent,
        traits->'consent_updated_at' as consent_updated_at
      FROM analytics.user_profiles
      WHERE user_id = $1
    `;

    const result = await this.pool.query(query, [userId]);
    
    if (result.rows.length === 0) {
      return null;
    }

    return {
      consent: result.rows[0].consent || {},
      updatedAt: result.rows[0].consent_updated_at
    };
  }

  /**
   * Update consent
   */
  async updateConsent(
    userId: string,
    consent: Record<string, boolean>
  ): Promise<void> {
    const query = `
      UPDATE analytics.user_profiles
      SET traits = jsonb_set(
        jsonb_set(traits, '{consent}', $2::jsonb),
        '{consent_updated_at}',
        to_jsonb(NOW())
      )
      WHERE user_id = $1
    `;

    await this.pool.query(query, [userId, JSON.stringify(consent)]);
    
    this.logger.info('Consent updated', {
      userId,
      consent
    });
  }
}