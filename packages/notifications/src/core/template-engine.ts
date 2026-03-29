/**
 * Template Engine - Manages notification templates and compilation
 */

import Handlebars from 'handlebars';
import Redis from 'ioredis';
import { Logger } from 'winston';
import {
  NotificationTemplate,
  NotificationChannel,
  NotificationCategory
} from '../types/notification.types';
import { createLogger } from '../utils/logger';

export interface CompiledTemplate {
  subject?: string;
  body: string;
  htmlBody?: string;
  metadata?: Record<string, any>;
}

export class TemplateEngine {
  private templates: Map<string, NotificationTemplate> = new Map();
  private compiledCache: Map<string, Handlebars.TemplateDelegate> = new Map();
  private logger: Logger;

  constructor(private redis?: Redis) {
    this.logger = createLogger('TemplateEngine');
    this.registerHelpers();
  }

  /**
   * Register a new template
   */
  async registerTemplate(template: NotificationTemplate): Promise<void> {
    try {
      // Validate template
      this.validateTemplate(template);

      // Store in memory
      this.templates.set(template.id, template);

      // Clear compiled cache for this template
      this.clearTemplateCache(template.id);

      // Store in Redis if available
      if (this.redis) {
        const templateKey = `notification:template:${template.id}`;
        await this.redis.setex(templateKey, 86400 * 30, JSON.stringify(template)); // Keep for 30 days
      }

      this.logger.info(`Template registered: ${template.id}`);
    } catch (error) {
      this.logger.error(`Failed to register template ${template.id}:`, error);
      throw error;
    }
  }

  /**
   * Get a template by ID
   */
  async getTemplate(templateId: string, organizationId?: string): Promise<NotificationTemplate | null> {
    try {
      // Check memory cache first
      let template = this.templates.get(templateId);

      if (!template && this.redis) {
        // Try loading from Redis
        const templateKey = `notification:template:${templateId}`;
        const templateData = await this.redis.get(templateKey);

        if (templateData) {
          template = JSON.parse(templateData) as NotificationTemplate;
          this.templates.set(templateId, template);
        }
      }

      // Check organization scope
      if (template && template.organizationId && template.organizationId !== organizationId) {
        return null;
      }

      return template || null;
    } catch (error) {
      this.logger.error(`Failed to get template ${templateId}:`, error);
      return null;
    }
  }

  /**
   * Compile template with variables
   */
  async compile(
    templateId: string,
    channel: NotificationChannel,
    variables: Record<string, any>,
    organizationId?: string
  ): Promise<CompiledTemplate> {
    try {
      // Get template
      const template = await this.getTemplate(templateId, organizationId);
      if (!template) {
        throw new Error(`Template not found: ${templateId}`);
      }

      if (!template.channels.includes(channel)) {
        throw new Error(`Template ${templateId} does not support channel: ${channel}`);
      }

      const channelContent = template.content[channel];
      if (!channelContent) {
        throw new Error(`No content defined for channel ${channel} in template ${templateId}`);
      }

      // Validate required variables
      this.validateVariables(template, variables);

      // Add default variables
      const allVariables = {
        ...this.getDefaultVariables(),
        ...variables
      };

      // Compile templates
      const result: CompiledTemplate = {
        body: await this.compileTemplate(channelContent.body, allVariables, `${templateId}-${channel}-body`),
        metadata: channelContent.metadata
      };

      if (channelContent.subject) {
        result.subject = await this.compileTemplate(
          channelContent.subject,
          allVariables,
          `${templateId}-${channel}-subject`
        );
      }

      if (channelContent.htmlBody) {
        result.htmlBody = await this.compileTemplate(
          channelContent.htmlBody,
          allVariables,
          `${templateId}-${channel}-html`
        );
      }

      return result;
    } catch (error) {
      this.logger.error(`Failed to compile template ${templateId}:`, error);
      throw error;
    }
  }

  /**
   * List available templates
   */
  async listTemplates(organizationId?: string): Promise<NotificationTemplate[]> {
    const templates = Array.from(this.templates.values());

    if (organizationId) {
      return templates.filter(t => !t.organizationId || t.organizationId === organizationId);
    }

    return templates.filter(t => !t.organizationId); // Only global templates
  }

  /**
   * Delete a template
   */
  async deleteTemplate(templateId: string): Promise<void> {
    try {
      // Remove from memory
      this.templates.delete(templateId);

      // Clear cache
      this.clearTemplateCache(templateId);

      // Remove from Redis
      if (this.redis) {
        const templateKey = `notification:template:${templateId}`;
        await this.redis.del(templateKey);
      }

      this.logger.info(`Template deleted: ${templateId}`);
    } catch (error) {
      this.logger.error(`Failed to delete template ${templateId}:`, error);
      throw error;
    }
  }

  /**
   * Update template
   */
  async updateTemplate(template: NotificationTemplate): Promise<void> {
    await this.registerTemplate(template);
  }

  /**
   * Create template from content
   */
  createTemplateFromContent(
    id: string,
    name: string,
    category: NotificationCategory,
    channels: NotificationChannel[],
    content: { [K in NotificationChannel]?: { subject?: string; body: string; htmlBody?: string } },
    organizationId?: string
  ): NotificationTemplate {
    return {
      id,
      name,
      category,
      channels,
      content,
      variables: [],
      priority: 'normal' as any,
      version: '1.0.0',
      isActive: true,
      organizationId,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  /**
   * Validate template structure
   */
  private validateTemplate(template: NotificationTemplate): void {
    if (!template.id || !template.name || !template.category) {
      throw new Error('Template must have id, name, and category');
    }

    if (!template.channels || template.channels.length === 0) {
      throw new Error('Template must specify at least one channel');
    }

    for (const channel of template.channels) {
      if (!template.content[channel]) {
        throw new Error(`Template content missing for channel: ${channel}`);
      }

      const channelContent = template.content[channel]!;
      if (!channelContent.body) {
        throw new Error(`Template body missing for channel: ${channel}`);
      }
    }
  }

  /**
   * Validate template variables
   */
  private validateVariables(template: NotificationTemplate, variables: Record<string, any>): void {
    for (const varDef of template.variables) {
      if (varDef.required && !(varDef.name in variables)) {
        throw new Error(`Required template variable missing: ${varDef.name}`);
      }

      if (varDef.name in variables) {
        const value = variables[varDef.name];
        const actualType = typeof value;

        // Basic type validation
        if (varDef.type === 'string' && actualType !== 'string') {
          throw new Error(`Variable ${varDef.name} should be string, got ${actualType}`);
        }
        if (varDef.type === 'number' && actualType !== 'number') {
          throw new Error(`Variable ${varDef.name} should be number, got ${actualType}`);
        }
        if (varDef.type === 'boolean' && actualType !== 'boolean') {
          throw new Error(`Variable ${varDef.name} should be boolean, got ${actualType}`);
        }
      }
    }
  }

  /**
   * Compile individual template string
   */
  private async compileTemplate(
    templateString: string,
    variables: Record<string, any>,
    cacheKey: string
  ): Promise<string> {
    try {
      let compiledTemplate = this.compiledCache.get(cacheKey);

      if (!compiledTemplate) {
        compiledTemplate = Handlebars.compile(templateString);
        this.compiledCache.set(cacheKey, compiledTemplate);
      }

      return compiledTemplate(variables);
    } catch (error) {
      this.logger.error(`Failed to compile template string:`, error);
      throw new Error(`Template compilation failed: ${error.message}`);
    }
  }

  /**
   * Clear template cache
   */
  private clearTemplateCache(templateId: string): void {
    const keysToDelete = Array.from(this.compiledCache.keys()).filter(key =>
      key.startsWith(templateId)
    );

    for (const key of keysToDelete) {
      this.compiledCache.delete(key);
    }
  }

  /**
   * Get default template variables
   */
  private getDefaultVariables(): Record<string, any> {
    return {
      currentDate: new Date(),
      currentYear: new Date().getFullYear(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Register Handlebars helpers
   */
  private registerHelpers(): void {
    // Date formatting helper
    Handlebars.registerHelper('formatDate', (date: Date | string, format?: string) => {
      const dateObj = typeof date === 'string' ? new Date(date) : date;

      if (format === 'short') {
        return dateObj.toLocaleDateString();
      } else if (format === 'long') {
        return dateObj.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
      } else if (format === 'time') {
        return dateObj.toLocaleTimeString();
      }

      return dateObj.toLocaleString();
    });

    // Currency formatting helper
    Handlebars.registerHelper('formatCurrency', (amount: number, currency = 'USD') => {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency
      }).format(amount / 100); // Assuming amount is in cents
    });

    // Capitalize helper
    Handlebars.registerHelper('capitalize', (text: string) => {
      return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
    });

    // JSON stringify helper
    Handlebars.registerHelper('json', (obj: any) => {
      return JSON.stringify(obj);
    });

    // Conditional helpers
    Handlebars.registerHelper('eq', (a: any, b: any) => a === b);
    Handlebars.registerHelper('ne', (a: any, b: any) => a !== b);
    Handlebars.registerHelper('gt', (a: any, b: any) => a > b);
    Handlebars.registerHelper('lt', (a: any, b: any) => a < b);

    // Array helpers
    Handlebars.registerHelper('length', (array: any[]) => array ? array.length : 0);
    Handlebars.registerHelper('first', (array: any[]) => array && array.length > 0 ? array[0] : null);
    Handlebars.registerHelper('last', (array: any[]) => array && array.length > 0 ? array[array.length - 1] : null);

    this.logger.info('Template helpers registered');
  }
}