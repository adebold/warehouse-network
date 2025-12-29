import { v4 as uuidv4 } from 'uuid';
import { Database } from '../config/database';
import { RedisClient } from '../config/redis';
import { Logger } from '../utils/logger';
import { 
  Content, 
  ContentStatus, 
  ContentMetadata,
  Channel,
  ContentFormat
} from '../types';

export interface ContentCreateInput {
  title: string;
  body: string;
  metadata: ContentMetadata;
  channels: string[];
  status?: ContentStatus;
  scheduledAt?: Date;
  expiresAt?: Date;
}

export interface ContentUpdateInput {
  title?: string;
  body?: string;
  metadata?: ContentMetadata;
  channels?: string[];
  status?: ContentStatus;
  scheduledAt?: Date;
  expiresAt?: Date;
}

export interface ContentFilter {
  status?: ContentStatus;
  createdBy?: string;
  channels?: string[];
  tags?: string[];
  categories?: string[];
  fromDate?: Date;
  toDate?: Date;
  search?: string;
}

export interface ContentVersion {
  id: string;
  contentId: string;
  version: number;
  title: string;
  body: string;
  metadata: ContentMetadata;
  createdBy: string;
  createdAt: Date;
  changeSummary?: string;
}

export class ContentManager {
  private db: Database;
  private redis: RedisClient;
  private logger: Logger;
  private maxVersions: number;

  constructor(db: Database, redis: RedisClient) {
    this.db = db;
    this.redis = redis;
    this.logger = new Logger('ContentManager');
    this.maxVersions = parseInt(process.env.MAX_CONTENT_VERSIONS || '10');
  }

  async create(input: ContentCreateInput, userId: string): Promise<Content> {
    this.logger.info('Creating content', { title: input.title, userId });

    return await this.db.transaction(async (client) => {
      // Create content
      const contentId = uuidv4();
      const contentQuery = `
        INSERT INTO content (
          id, title, body, metadata, status, created_by,
          scheduled_at, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;

      const contentValues = [
        contentId,
        input.title,
        input.body,
        JSON.stringify(input.metadata),
        input.status || ContentStatus.DRAFT,
        userId,
        input.scheduledAt,
        input.expiresAt
      ];

      const contentResult = await client.query(contentQuery, contentValues);
      const content = contentResult.rows[0];

      // Create initial version
      const versionQuery = `
        INSERT INTO content_versions (
          content_id, version, title, body, metadata, created_by, change_summary
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `;

      await client.query(versionQuery, [
        contentId,
        1,
        input.title,
        input.body,
        JSON.stringify(input.metadata),
        userId,
        'Initial version'
      ]);

      // Associate channels
      if (input.channels && input.channels.length > 0) {
        const channelQuery = `
          INSERT INTO content_channels (content_id, channel_id)
          VALUES ($1, $2)
        `;

        for (const channelId of input.channels) {
          await client.query(channelQuery, [contentId, channelId]);
        }
      }

      // Cache the content
      await this.redis.set(`content:${contentId}`, content, 3600);

      this.logger.info('Content created successfully', { contentId });
      this.logger.audit('content_create', userId, contentId, { title: input.title });

      return this.mapToContent(content);
    });
  }

  async update(
    contentId: string, 
    input: ContentUpdateInput, 
    userId: string
  ): Promise<Content> {
    this.logger.info('Updating content', { contentId, userId });

    return await this.db.transaction(async (client) => {
      // Get current content
      const currentQuery = `SELECT * FROM content WHERE id = $1`;
      const currentResult = await client.query(currentQuery, [contentId]);
      
      if (currentResult.rows.length === 0) {
        throw new Error('Content not found');
      }

      const current = currentResult.rows[0];

      // Update content
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (input.title !== undefined) {
        updates.push(`title = $${paramIndex++}`);
        values.push(input.title);
      }
      if (input.body !== undefined) {
        updates.push(`body = $${paramIndex++}`);
        values.push(input.body);
      }
      if (input.metadata !== undefined) {
        updates.push(`metadata = $${paramIndex++}`);
        values.push(JSON.stringify(input.metadata));
      }
      if (input.status !== undefined) {
        updates.push(`status = $${paramIndex++}`);
        values.push(input.status);
        
        // Update published_at if status changes to published
        if (input.status === ContentStatus.PUBLISHED && current.status !== ContentStatus.PUBLISHED) {
          updates.push(`published_at = CURRENT_TIMESTAMP`);
        }
      }
      if (input.scheduledAt !== undefined) {
        updates.push(`scheduled_at = $${paramIndex++}`);
        values.push(input.scheduledAt);
      }
      if (input.expiresAt !== undefined) {
        updates.push(`expires_at = $${paramIndex++}`);
        values.push(input.expiresAt);
      }

      // Increment version
      updates.push(`version = version + 1`);
      values.push(contentId);

      const updateQuery = `
        UPDATE content 
        SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $${paramIndex}
        RETURNING *
      `;

      const updateResult = await client.query(updateQuery, values);
      const updated = updateResult.rows[0];

      // Create version record
      const versionQuery = `
        INSERT INTO content_versions (
          content_id, version, title, body, metadata, created_by, change_summary
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `;

      await client.query(versionQuery, [
        contentId,
        updated.version,
        updated.title,
        updated.body,
        updated.metadata,
        userId,
        this.generateChangeSummary(current, updated)
      ]);

      // Clean up old versions
      await this.cleanupOldVersions(client, contentId);

      // Update channels if provided
      if (input.channels !== undefined) {
        // Remove existing associations
        await client.query(`DELETE FROM content_channels WHERE content_id = $1`, [contentId]);

        // Add new associations
        if (input.channels.length > 0) {
          const channelQuery = `
            INSERT INTO content_channels (content_id, channel_id)
            VALUES ($1, $2)
          `;

          for (const channelId of input.channels) {
            await client.query(channelQuery, [contentId, channelId]);
          }
        }
      }

      // Invalidate cache
      await this.redis.del(`content:${contentId}`);

      this.logger.info('Content updated successfully', { contentId, version: updated.version });
      this.logger.audit('content_update', userId, contentId, { version: updated.version });

      return this.mapToContent(updated);
    });
  }

  async get(contentId: string): Promise<Content | null> {
    // Try cache first
    const cached = await this.redis.get<Content>(`content:${contentId}`);
    if (cached) {
      this.logger.debug('Content retrieved from cache', { contentId });
      return cached;
    }

    // Query database
    const query = `
      SELECT c.*, 
        array_agg(DISTINCT ch.id) as channel_ids
      FROM content c
      LEFT JOIN content_channels cc ON c.id = cc.content_id
      LEFT JOIN channels ch ON cc.channel_id = ch.id
      WHERE c.id = $1
      GROUP BY c.id
    `;

    const result = await this.db.query(query, [contentId]);
    
    if (result.rows.length === 0) {
      return null;
    }

    const content = this.mapToContent(result.rows[0]);

    // Cache for 1 hour
    await this.redis.set(`content:${contentId}`, content, 3600);

    return content;
  }

  async list(filter: ContentFilter, limit: number = 50, offset: number = 0): Promise<{
    items: Content[];
    total: number;
  }> {
    const conditions: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (filter.status) {
      conditions.push(`c.status = $${paramIndex++}`);
      values.push(filter.status);
    }

    if (filter.createdBy) {
      conditions.push(`c.created_by = $${paramIndex++}`);
      values.push(filter.createdBy);
    }

    if (filter.fromDate) {
      conditions.push(`c.created_at >= $${paramIndex++}`);
      values.push(filter.fromDate);
    }

    if (filter.toDate) {
      conditions.push(`c.created_at <= $${paramIndex++}`);
      values.push(filter.toDate);
    }

    if (filter.search) {
      conditions.push(`(c.title ILIKE $${paramIndex} OR c.body ILIKE $${paramIndex})`);
      values.push(`%${filter.search}%`);
      paramIndex++;
    }

    if (filter.tags && filter.tags.length > 0) {
      conditions.push(`c.metadata->'tags' ?| $${paramIndex++}`);
      values.push(filter.tags);
    }

    if (filter.categories && filter.categories.length > 0) {
      conditions.push(`c.metadata->'categories' ?| $${paramIndex++}`);
      values.push(filter.categories);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countQuery = `
      SELECT COUNT(DISTINCT c.id) as total
      FROM content c
      ${filter.channels ? 'INNER JOIN content_channels cc ON c.id = cc.content_id' : ''}
      ${whereClause}
      ${filter.channels ? `AND cc.channel_id = ANY($${paramIndex++})` : ''}
    `;

    if (filter.channels) {
      values.push(filter.channels);
    }

    const countResult = await this.db.query(countQuery, values);
    const total = parseInt(countResult.rows[0].total);

    // Get paginated results
    const query = `
      SELECT c.*, 
        array_agg(DISTINCT ch.id) as channel_ids
      FROM content c
      LEFT JOIN content_channels cc ON c.id = cc.content_id
      LEFT JOIN channels ch ON cc.channel_id = ch.id
      ${whereClause}
      ${filter.channels ? `AND cc.channel_id = ANY($${paramIndex++})` : ''}
      GROUP BY c.id
      ORDER BY c.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `;

    const queryValues = [...values];
    if (filter.channels) {
      queryValues.push(filter.channels);
    }
    queryValues.push(limit, offset);

    const result = await this.db.query(query, queryValues);
    const items = result.rows.map(row => this.mapToContent(row));

    return { items, total };
  }

  async delete(contentId: string, userId: string): Promise<void> {
    this.logger.info('Deleting content', { contentId, userId });

    // Soft delete by updating status
    const query = `
      UPDATE content 
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `;

    await this.db.query(query, [ContentStatus.ARCHIVED, contentId]);

    // Invalidate cache
    await this.redis.del(`content:${contentId}`);

    this.logger.info('Content deleted successfully', { contentId });
    this.logger.audit('content_delete', userId, contentId);
  }

  async getVersions(contentId: string): Promise<ContentVersion[]> {
    const query = `
      SELECT cv.*, u.name as created_by_name
      FROM content_versions cv
      INNER JOIN users u ON cv.created_by = u.id
      WHERE cv.content_id = $1
      ORDER BY cv.version DESC
    `;

    const result = await this.db.query(query, [contentId]);
    
    return result.rows.map(row => ({
      id: row.id,
      contentId: row.content_id,
      version: row.version,
      title: row.title,
      body: row.body,
      metadata: row.metadata,
      createdBy: row.created_by_name,
      createdAt: row.created_at,
      changeSummary: row.change_summary
    }));
  }

  async restoreVersion(contentId: string, version: number, userId: string): Promise<Content> {
    this.logger.info('Restoring content version', { contentId, version, userId });

    return await this.db.transaction(async (client) => {
      // Get the version to restore
      const versionQuery = `
        SELECT * FROM content_versions 
        WHERE content_id = $1 AND version = $2
      `;

      const versionResult = await client.query(versionQuery, [contentId, version]);
      
      if (versionResult.rows.length === 0) {
        throw new Error('Version not found');
      }

      const versionData = versionResult.rows[0];

      // Update content with version data
      const updateQuery = `
        UPDATE content 
        SET title = $1, body = $2, metadata = $3, version = version + 1, 
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
        RETURNING *
      `;

      const updateResult = await client.query(updateQuery, [
        versionData.title,
        versionData.body,
        versionData.metadata,
        contentId
      ]);

      const updated = updateResult.rows[0];

      // Create new version record
      const newVersionQuery = `
        INSERT INTO content_versions (
          content_id, version, title, body, metadata, created_by, change_summary
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `;

      await client.query(newVersionQuery, [
        contentId,
        updated.version,
        updated.title,
        updated.body,
        updated.metadata,
        userId,
        `Restored from version ${version}`
      ]);

      // Invalidate cache
      await this.redis.del(`content:${contentId}`);

      this.logger.info('Content version restored successfully', { 
        contentId, 
        fromVersion: version, 
        toVersion: updated.version 
      });
      this.logger.audit('content_restore', userId, contentId, { 
        fromVersion: version, 
        toVersion: updated.version 
      });

      return this.mapToContent(updated);
    });
  }

  async bulkUpdateStatus(
    contentIds: string[], 
    status: ContentStatus, 
    userId: string
  ): Promise<void> {
    this.logger.info('Bulk updating content status', { count: contentIds.length, status, userId });

    const query = `
      UPDATE content 
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      ${status === ContentStatus.PUBLISHED ? ', published_at = CURRENT_TIMESTAMP' : ''}
      WHERE id = ANY($2)
    `;

    await this.db.query(query, [status, contentIds]);

    // Invalidate cache for all updated content
    const deletePromises = contentIds.map(id => this.redis.del(`content:${id}`));
    await Promise.all(deletePromises);

    this.logger.info('Bulk status update completed', { count: contentIds.length });
    this.logger.audit('content_bulk_update', userId, 'bulk', { 
      count: contentIds.length, 
      status 
    });
  }

  private async cleanupOldVersions(client: any, contentId: string): Promise<void> {
    const deleteQuery = `
      DELETE FROM content_versions
      WHERE content_id = $1 AND version <= (
        SELECT version - $2
        FROM content
        WHERE id = $1
      )
    `;

    await client.query(deleteQuery, [contentId, this.maxVersions]);
  }

  private generateChangeSummary(oldContent: any, newContent: any): string {
    const changes: string[] = [];

    if (oldContent.title !== newContent.title) {
      changes.push('Title updated');
    }
    if (oldContent.body !== newContent.body) {
      changes.push('Content updated');
    }
    if (JSON.stringify(oldContent.metadata) !== JSON.stringify(newContent.metadata)) {
      changes.push('Metadata updated');
    }
    if (oldContent.status !== newContent.status) {
      changes.push(`Status changed from ${oldContent.status} to ${newContent.status}`);
    }

    return changes.length > 0 ? changes.join(', ') : 'Minor updates';
  }

  private mapToContent(row: any): Content {
    return {
      id: row.id,
      title: row.title,
      body: row.body,
      metadata: row.metadata,
      channels: row.channel_ids?.filter((id: any) => id !== null) || [],
      status: row.status,
      version: row.version,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      publishedAt: row.published_at,
      scheduledAt: row.scheduled_at,
      expiresAt: row.expires_at
    };
  }
}