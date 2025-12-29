import { Logger } from 'winston';
import { Pool } from 'pg';
import Redis from 'ioredis';
import sgMail from '@sendgrid/mail';
import sgClient from '@sendgrid/client';
import AWS from 'aws-sdk';
import mjml2html from 'mjml';
import Handlebars from 'handlebars';
import { convert as htmlToText } from 'html-to-text';
import juice from 'juice';
import validator from 'validator';
import {
  ChannelType,
  ChannelConfig,
  ChannelCredentials,
  ChannelResponse,
  PostContent,
  PostResult,
  ScheduleOptions,
  AnalyticsData,
  ChannelError
} from '@marketing-engine/core/interfaces/channel.interface';
import { BaseChannelAdapter } from '@marketing-engine/shared/adapters/base-channel.adapter';

export enum EmailProvider {
  SENDGRID = 'sendgrid',
  AWS_SES = 'aws_ses'
}

interface EmailContent {
  to: string | string[];
  from: string;
  fromName?: string;
  replyTo?: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: EmailAttachment[];
  headers?: Record<string, string>;
  categories?: string[];
  substitutions?: Record<string, any>;
  templateId?: string;
  listId?: string;
  segmentIds?: string[];
  unsubscribeGroup?: number;
  ipPool?: string;
  batchId?: string;
  sendAt?: Date;
}

interface EmailAttachment {
  content: string; // Base64 encoded
  filename: string;
  type?: string;
  disposition?: 'attachment' | 'inline';
  contentId?: string;
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  mjml?: string;
  html?: string;
  text?: string;
  variables: string[];
}

interface EmailList {
  id: string;
  name: string;
  subscriberCount: number;
  segments?: EmailSegment[];
}

interface EmailSegment {
  id: string;
  name: string;
  conditions: any;
  subscriberCount: number;
}

interface BounceInfo {
  email: string;
  type: 'hard' | 'soft' | 'blocked';
  reason: string;
  timestamp: Date;
}

export class EmailAdapter extends BaseChannelAdapter {
  readonly channelType = ChannelType.EMAIL;
  private provider: EmailProvider;
  private sesClient?: AWS.SES;
  private templates: Map<string, Handlebars.TemplateDelegate> = new Map();

  constructor(
    config: ChannelConfig,
    logger: Logger,
    db: Pool,
    redis: Redis
  ) {
    super(config, logger, db, redis);
    
    this.provider = (config.credentials.additionalData?.provider as EmailProvider) || EmailProvider.SENDGRID;
    
    this.initializeProvider();
  }

  private initializeProvider(): void {
    switch (this.provider) {
      case EmailProvider.SENDGRID:
        sgMail.setApiKey(process.env.SENDGRID_API_KEY!);
        sgClient.setApiKey(process.env.SENDGRID_API_KEY!);
        break;
        
      case EmailProvider.AWS_SES:
        this.sesClient = new AWS.SES({
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          region: process.env.AWS_REGION || 'us-east-1'
        });
        break;
    }
  }

  async authenticate(credentials: ChannelCredentials): Promise<ChannelResponse<ChannelCredentials>> {
    try {
      switch (this.provider) {
        case EmailProvider.SENDGRID:
          return await this.authenticateSendGrid(credentials);
        case EmailProvider.AWS_SES:
          return await this.authenticateAWSSES(credentials);
        default:
          throw new Error(`Unsupported email provider: ${this.provider}`);
      }
    } catch (error: any) {
      this.logger.error(`${this.provider} authentication failed`, error);
      return {
        success: false,
        error: this.createError(
          'AUTH_FAILED',
          `Failed to authenticate with ${this.provider}`,
          error.message,
          false
        )
      };
    }
  }

  private async authenticateSendGrid(credentials: ChannelCredentials): Promise<ChannelResponse<ChannelCredentials>> {
    // Verify API key by making a simple request
    const [response] = await sgClient.request({
      method: 'GET',
      url: '/v3/user/profile'
    });

    const profile = response.body as any;

    return {
      success: true,
      data: {
        ...credentials,
        additionalData: {
          ...credentials.additionalData,
          accountType: profile.account_type,
          email: profile.email
        }
      }
    };
  }

  private async authenticateAWSSES(credentials: ChannelCredentials): Promise<ChannelResponse<ChannelCredentials>> {
    // Verify credentials by checking sending quota
    const quota = await this.sesClient!.getSendQuota().promise();

    return {
      success: true,
      data: {
        ...credentials,
        additionalData: {
          ...credentials.additionalData,
          maxSendRate: quota.MaxSendRate,
          max24HourSend: quota.Max24HourSend,
          sentLast24Hours: quota.SentLast24Hours
        }
      }
    };
  }

  async refreshCredentials(credentials: ChannelCredentials): Promise<ChannelResponse<ChannelCredentials>> {
    // Email API keys typically don't expire
    return this.authenticate(credentials);
  }

  protected async performCredentialValidation(credentials: ChannelCredentials): Promise<boolean> {
    try {
      switch (this.provider) {
        case EmailProvider.SENDGRID:
          await sgClient.request({
            method: 'GET',
            url: '/v3/user/profile'
          });
          return true;
          
        case EmailProvider.AWS_SES:
          await this.sesClient!.getSendQuota().promise();
          return true;
          
        default:
          return false;
      }
    } catch (error) {
      return false;
    }
  }

  protected async performCreatePost(
    content: PostContent,
    options?: ScheduleOptions
  ): Promise<ChannelResponse<PostResult>> {
    try {
      // Convert PostContent to EmailContent
      const emailContent = await this.convertToEmailContent(content, options);
      
      // Validate recipients
      const validationError = this.validateRecipients(emailContent.to);
      if (validationError) {
        return {
          success: false,
          error: validationError
        };
      }

      // Process template if specified
      if (content.metadata?.templateId) {
        const template = await this.loadTemplate(content.metadata.templateId);
        emailContent.html = await this.renderTemplate(template, content.metadata?.variables || {});
        emailContent.text = htmlToText(emailContent.html);
      }

      // Inline CSS for better email client compatibility
      emailContent.html = juice(emailContent.html);

      // Send based on provider
      switch (this.provider) {
        case EmailProvider.SENDGRID:
          return await this.sendViaSendGrid(emailContent);
        case EmailProvider.AWS_SES:
          return await this.sendViaAWSSES(emailContent);
        default:
          throw new Error(`Unsupported provider: ${this.provider}`);
      }
    } catch (error: any) {
      this.logger.error('Failed to send email', error);
      return {
        success: false,
        error: this.createError(
          'SEND_FAILED',
          'Failed to send email',
          error.message,
          this.isRetryableError(error)
        )
      };
    }
  }

  private async sendViaSendGrid(email: EmailContent): Promise<ChannelResponse<PostResult>> {
    const msg: any = {
      to: email.to,
      from: {
        email: email.from,
        name: email.fromName
      },
      subject: email.subject,
      html: email.html,
      text: email.text || htmlToText(email.html),
      categories: email.categories,
      substitutions: email.substitutions,
      customArgs: {
        campaign_id: email.metadata?.campaignId,
        user_id: email.metadata?.userId
      }
    };

    if (email.replyTo) {
      msg.replyTo = email.replyTo;
    }

    if (email.attachments) {
      msg.attachments = email.attachments.map(att => ({
        content: att.content,
        filename: att.filename,
        type: att.type,
        disposition: att.disposition,
        contentId: att.contentId
      }));
    }

    if (email.sendAt) {
      msg.sendAt = Math.floor(email.sendAt.getTime() / 1000);
    }

    if (email.batchId) {
      msg.batchId = email.batchId;
    }

    const response = await sgMail.send(msg);
    const messageId = response[0].headers['x-message-id'];

    return {
      success: true,
      data: {
        id: messageId || `sg_${Date.now()}`,
        status: email.sendAt ? 'scheduled' : 'published',
        publishedAt: email.sendAt ? undefined : new Date(),
        scheduledAt: email.sendAt
      }
    };
  }

  private async sendViaAWSSES(email: EmailContent): Promise<ChannelResponse<PostResult>> {
    const params: AWS.SES.SendEmailRequest = {
      Source: email.fromName ? `${email.fromName} <${email.from}>` : email.from,
      Destination: {
        ToAddresses: Array.isArray(email.to) ? email.to : [email.to]
      },
      Message: {
        Subject: {
          Data: email.subject,
          Charset: 'UTF-8'
        },
        Body: {
          Html: {
            Data: email.html,
            Charset: 'UTF-8'
          },
          Text: {
            Data: email.text || htmlToText(email.html),
            Charset: 'UTF-8'
          }
        }
      }
    };

    if (email.replyTo) {
      params.ReplyToAddresses = [email.replyTo];
    }

    if (email.headers) {
      params.Tags = Object.entries(email.headers).map(([Name, Value]) => ({ Name, Value }));
    }

    const result = await this.sesClient!.sendEmail(params).promise();

    return {
      success: true,
      data: {
        id: result.MessageId,
        status: 'published',
        publishedAt: new Date()
      }
    };
  }

  protected async performUpdatePost(
    postId: string,
    content: Partial<PostContent>
  ): Promise<ChannelResponse<PostResult>> {
    // Email updates aren't supported once sent
    return {
      success: false,
      error: this.createError(
        'NOT_SUPPORTED',
        'Emails cannot be updated once sent',
        null,
        false
      )
    };
  }

  protected async performDeletePost(postId: string): Promise<ChannelResponse<void>> {
    // Emails cannot be deleted once sent
    return {
      success: false,
      error: this.createError(
        'NOT_SUPPORTED',
        'Emails cannot be deleted once sent',
        null,
        false
      )
    };
  }

  protected async performGetPost(postId: string): Promise<ChannelResponse<PostResult>> {
    try {
      // Query our database for email record
      const result = await this.db.query(
        'SELECT * FROM posts WHERE external_id = $1 AND channel_id = $2',
        [postId, this.channelId]
      );

      if (result.rows.length === 0) {
        return {
          success: false,
          error: this.createError('NOT_FOUND', 'Email not found', null, false)
        };
      }

      const post = result.rows[0];

      return {
        success: true,
        data: {
          id: post.external_id,
          status: post.status,
          publishedAt: post.published_at,
          scheduledAt: post.scheduled_at
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: this.createError(
          'GET_FAILED',
          'Failed to retrieve email',
          error.message,
          false
        )
      };
    }
  }

  protected async performGetAnalytics(
    postId: string,
    startDate: Date,
    endDate: Date
  ): Promise<ChannelResponse<AnalyticsData>> {
    try {
      switch (this.provider) {
        case EmailProvider.SENDGRID:
          return await this.getSendGridAnalytics(postId, startDate, endDate);
        case EmailProvider.AWS_SES:
          return await this.getAWSSESAnalytics(postId, startDate, endDate);
        default:
          throw new Error(`Unsupported provider: ${this.provider}`);
      }
    } catch (error: any) {
      this.logger.error('Failed to get email analytics', error);
      return {
        success: false,
        error: this.createError(
          'ANALYTICS_FAILED',
          'Failed to retrieve email analytics',
          error.message,
          false
        )
      };
    }
  }

  private async getSendGridAnalytics(
    messageId: string,
    startDate: Date,
    endDate: Date
  ): Promise<ChannelResponse<AnalyticsData>> {
    // SendGrid's stats API is aggregate, not per-message
    // We'll query our event webhook data instead
    const events = await this.db.query(
      `SELECT event_type, COUNT(*) as count
       FROM webhook_deliveries
       WHERE channel_id = $1 
         AND payload->>'msg_id' = $2
         AND created_at BETWEEN $3 AND $4
       GROUP BY event_type`,
      [this.channelId, messageId, startDate, endDate]
    );

    const stats = events.rows.reduce((acc, row) => {
      acc[row.event_type] = parseInt(row.count);
      return acc;
    }, {} as Record<string, number>);

    return {
      success: true,
      data: {
        impressions: stats.delivered || 0,
        clicks: stats.click || 0,
        engagement: (stats.click || 0) + (stats.open || 0),
        reach: stats.delivered || 0,
        conversions: 0, // Would need additional tracking
        spend: 0, // Calculate based on volume
        customMetrics: {
          opens: stats.open || 0,
          bounces: (stats.bounce || 0) + (stats.blocked || 0),
          spamReports: stats.spamreport || 0,
          unsubscribes: stats.unsubscribe || 0
        },
        timestamp: new Date()
      }
    };
  }

  private async getAWSSESAnalytics(
    messageId: string,
    startDate: Date,
    endDate: Date
  ): Promise<ChannelResponse<AnalyticsData>> {
    // AWS SES provides limited analytics via CloudWatch
    // You'd typically set up event publishing to track detailed metrics
    
    // Query our stored events
    const events = await this.db.query(
      `SELECT 
         SUM(CASE WHEN event_type = 'send' THEN 1 ELSE 0 END) as sends,
         SUM(CASE WHEN event_type = 'bounce' THEN 1 ELSE 0 END) as bounces,
         SUM(CASE WHEN event_type = 'complaint' THEN 1 ELSE 0 END) as complaints,
         SUM(CASE WHEN event_type = 'delivery' THEN 1 ELSE 0 END) as deliveries,
         SUM(CASE WHEN event_type = 'open' THEN 1 ELSE 0 END) as opens,
         SUM(CASE WHEN event_type = 'click' THEN 1 ELSE 0 END) as clicks
       FROM webhook_deliveries
       WHERE channel_id = $1 
         AND payload->>'messageId' = $2
         AND created_at BETWEEN $3 AND $4`,
      [this.channelId, messageId, startDate, endDate]
    );

    const stats = events.rows[0] || {};

    return {
      success: true,
      data: {
        impressions: parseInt(stats.deliveries) || 0,
        clicks: parseInt(stats.clicks) || 0,
        engagement: (parseInt(stats.opens) || 0) + (parseInt(stats.clicks) || 0),
        reach: parseInt(stats.deliveries) || 0,
        conversions: 0,
        spend: 0,
        customMetrics: {
          sends: parseInt(stats.sends) || 0,
          opens: parseInt(stats.opens) || 0,
          bounces: parseInt(stats.bounces) || 0,
          complaints: parseInt(stats.complaints) || 0
        },
        timestamp: new Date()
      }
    };
  }

  protected async performGetAccountAnalytics(
    startDate: Date,
    endDate: Date
  ): Promise<ChannelResponse<AnalyticsData>> {
    try {
      switch (this.provider) {
        case EmailProvider.SENDGRID:
          return await this.getSendGridAccountAnalytics(startDate, endDate);
        case EmailProvider.AWS_SES:
          return await this.getAWSSESAccountAnalytics(startDate, endDate);
        default:
          throw new Error(`Unsupported provider: ${this.provider}`);
      }
    } catch (error: any) {
      return {
        success: false,
        error: this.createError(
          'ANALYTICS_FAILED',
          'Failed to retrieve account analytics',
          error.message,
          false
        )
      };
    }
  }

  private async getSendGridAccountAnalytics(
    startDate: Date,
    endDate: Date
  ): Promise<ChannelResponse<AnalyticsData>> {
    const [response] = await sgClient.request({
      method: 'GET',
      url: '/v3/stats',
      qs: {
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        aggregated_by: 'day'
      }
    });

    const stats = (response.body as any[]).reduce((acc, day) => {
      const metrics = day.stats[0]?.metrics || {};
      return {
        requests: acc.requests + (metrics.requests || 0),
        delivered: acc.delivered + (metrics.delivered || 0),
        opens: acc.opens + (metrics.opens || 0),
        unique_opens: acc.unique_opens + (metrics.unique_opens || 0),
        clicks: acc.clicks + (metrics.clicks || 0),
        unique_clicks: acc.unique_clicks + (metrics.unique_clicks || 0),
        bounces: acc.bounces + (metrics.bounces || 0),
        spam_reports: acc.spam_reports + (metrics.spam_reports || 0),
        unsubscribes: acc.unsubscribes + (metrics.unsubscribes || 0)
      };
    }, {
      requests: 0,
      delivered: 0,
      opens: 0,
      unique_opens: 0,
      clicks: 0,
      unique_clicks: 0,
      bounces: 0,
      spam_reports: 0,
      unsubscribes: 0
    });

    return {
      success: true,
      data: {
        impressions: stats.delivered,
        clicks: stats.unique_clicks,
        engagement: stats.unique_opens + stats.unique_clicks,
        reach: stats.delivered,
        conversions: 0,
        spend: 0, // Calculate based on SendGrid pricing
        customMetrics: {
          requests: stats.requests,
          opens: stats.opens,
          uniqueOpens: stats.unique_opens,
          clicks: stats.clicks,
          uniqueClicks: stats.unique_clicks,
          bounces: stats.bounces,
          spamReports: stats.spam_reports,
          unsubscribes: stats.unsubscribes,
          deliveryRate: stats.requests > 0 ? (stats.delivered / stats.requests) : 0,
          openRate: stats.delivered > 0 ? (stats.unique_opens / stats.delivered) : 0,
          clickRate: stats.delivered > 0 ? (stats.unique_clicks / stats.delivered) : 0
        },
        timestamp: new Date()
      }
    };
  }

  private async getAWSSESAccountAnalytics(
    startDate: Date,
    endDate: Date
  ): Promise<ChannelResponse<AnalyticsData>> {
    // Get sending statistics
    const stats = await this.sesClient!.getSendStatistics().promise();
    
    // Filter by date range
    const filteredStats = stats.SendDataPoints?.filter(point => {
      const timestamp = new Date(point.Timestamp!);
      return timestamp >= startDate && timestamp <= endDate;
    }) || [];

    const aggregated = filteredStats.reduce((acc, point) => ({
      sends: acc.sends + (point.DeliveryAttempts || 0),
      bounces: acc.bounces + (point.Bounces || 0),
      complaints: acc.complaints + (point.Complaints || 0),
      rejects: acc.rejects + (point.Rejects || 0)
    }), {
      sends: 0,
      bounces: 0,
      complaints: 0,
      rejects: 0
    });

    const delivered = aggregated.sends - aggregated.bounces - aggregated.rejects;

    return {
      success: true,
      data: {
        impressions: delivered,
        clicks: 0, // SES doesn't track clicks without additional setup
        engagement: 0, // SES doesn't track opens without additional setup
        reach: delivered,
        conversions: 0,
        spend: 0, // Calculate based on AWS SES pricing
        customMetrics: {
          sends: aggregated.sends,
          delivered,
          bounces: aggregated.bounces,
          complaints: aggregated.complaints,
          rejects: aggregated.rejects,
          deliveryRate: aggregated.sends > 0 ? (delivered / aggregated.sends) : 0,
          bounceRate: aggregated.sends > 0 ? (aggregated.bounces / aggregated.sends) : 0,
          complaintRate: aggregated.sends > 0 ? (aggregated.complaints / aggregated.sends) : 0
        },
        timestamp: new Date()
      }
    };
  }

  protected async checkAPIHealth(): Promise<{ reachable: boolean; responseTimeMs?: number }> {
    const startTime = Date.now();
    try {
      switch (this.provider) {
        case EmailProvider.SENDGRID:
          await sgClient.request({
            method: 'GET',
            url: '/v3/scopes'
          });
          break;
          
        case EmailProvider.AWS_SES:
          await this.sesClient!.getSendQuota().promise();
          break;
      }
      
      return {
        reachable: true,
        responseTimeMs: Date.now() - startTime
      };
    } catch (error) {
      return {
        reachable: false,
        responseTimeMs: Date.now() - startTime
      };
    }
  }

  protected async validateContent(content: PostContent): Promise<ChannelError | null> {
    // Email specific validation
    const email = content.metadata?.email;
    
    if (!email?.to) {
      return this.createError(
        'MISSING_RECIPIENT',
        'Email requires at least one recipient',
        null,
        false
      );
    }

    if (!email?.from) {
      return this.createError(
        'MISSING_SENDER',
        'Email requires a sender address',
        null,
        false
      );
    }

    if (!email?.subject) {
      return this.createError(
        'MISSING_SUBJECT',
        'Email requires a subject line',
        null,
        false
      );
    }

    // Validate email addresses
    const recipients = Array.isArray(email.to) ? email.to : [email.to];
    for (const recipient of recipients) {
      if (!validator.isEmail(recipient)) {
        return this.createError(
          'INVALID_EMAIL',
          `Invalid email address: ${recipient}`,
          { email: recipient },
          false
        );
      }
    }

    if (!validator.isEmail(email.from)) {
      return this.createError(
        'INVALID_SENDER',
        `Invalid sender email address: ${email.from}`,
        { email: email.from },
        false
      );
    }

    return null;
  }

  // Helper methods
  private async convertToEmailContent(
    content: PostContent,
    options?: ScheduleOptions
  ): Promise<EmailContent> {
    const email = content.metadata?.email || {};
    
    // Convert markdown to HTML if needed
    let htmlContent = content.metadata?.html || content.text;
    if (!content.metadata?.html && content.metadata?.useMjml) {
      htmlContent = this.convertMjmlToHtml(content.text);
    } else if (!content.metadata?.html) {
      htmlContent = this.convertMarkdownToHtml(content.text);
    }

    return {
      to: email.to || content.metadata?.recipients || [],
      from: email.from || process.env.DEFAULT_FROM_EMAIL!,
      fromName: email.fromName,
      replyTo: email.replyTo,
      subject: email.subject || content.metadata?.title || 'Newsletter',
      html: htmlContent,
      text: email.text || htmlToText(htmlContent),
      attachments: email.attachments,
      headers: email.headers,
      categories: content.hashtags,
      substitutions: content.metadata?.variables,
      templateId: content.metadata?.templateId,
      listId: content.metadata?.listId,
      segmentIds: content.metadata?.segmentIds,
      sendAt: options?.scheduledAt,
      metadata: content.metadata
    };
  }

  private convertMjmlToHtml(mjmlContent: string): string {
    const result = mjml2html(mjmlContent, {
      minify: true,
      validationLevel: 'soft'
    });

    if (result.errors.length > 0) {
      this.logger.warn('MJML conversion warnings:', result.errors);
    }

    return result.html;
  }

  private convertMarkdownToHtml(markdown: string): string {
    // Basic email template wrapper
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    h1, h2, h3 { color: #2c3e50; }
    a { color: #3498db; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e0e0e0; font-size: 14px; color: #666; }
  </style>
</head>
<body>
  ${marked(markdown)}
  <div class="footer">
    <p>You received this email because you subscribed to our newsletter.</p>
    <p><a href="{{{unsubscribe}}}">Unsubscribe</a> | <a href="{{{preferences}}}">Update Preferences</a></p>
  </div>
</body>
</html>`;
  }

  private validateRecipients(recipients: string | string[]): ChannelError | null {
    const recipientList = Array.isArray(recipients) ? recipients : [recipients];
    
    if (recipientList.length === 0) {
      return this.createError(
        'NO_RECIPIENTS',
        'At least one recipient is required',
        null,
        false
      );
    }

    if (recipientList.length > 1000) {
      return this.createError(
        'TOO_MANY_RECIPIENTS',
        'Maximum 1000 recipients per email',
        { max: 1000, actual: recipientList.length },
        false
      );
    }

    // Check for invalid emails
    const invalidEmails = recipientList.filter(email => !validator.isEmail(email));
    if (invalidEmails.length > 0) {
      return this.createError(
        'INVALID_RECIPIENTS',
        'Invalid email addresses found',
        { invalidEmails },
        false
      );
    }

    return null;
  }

  private async loadTemplate(templateId: string): Promise<EmailTemplate> {
    // Load from database
    const result = await this.db.query(
      'SELECT * FROM email_templates WHERE id = $1 AND channel_id = $2',
      [templateId, this.channelId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Template not found: ${templateId}`);
    }

    return result.rows[0];
  }

  private async renderTemplate(template: EmailTemplate, variables: Record<string, any>): Promise<string> {
    // Compile template if not cached
    if (!this.templates.has(template.id)) {
      const source = template.mjml ? this.convertMjmlToHtml(template.mjml) : template.html!;
      this.templates.set(template.id, Handlebars.compile(source));
    }

    const compiledTemplate = this.templates.get(template.id)!;
    return compiledTemplate(variables);
  }

  // List management
  async createList(name: string, description?: string): Promise<EmailList> {
    const id = `list_${Date.now()}`;
    
    await this.db.query(
      `INSERT INTO email_lists (id, channel_id, name, description)
       VALUES ($1, $2, $3, $4)`,
      [id, this.channelId, name, description]
    );

    return {
      id,
      name,
      subscriberCount: 0
    };
  }

  async addSubscriber(listId: string, email: string, metadata?: Record<string, any>): Promise<void> {
    // Validate email
    if (!validator.isEmail(email)) {
      throw new Error('Invalid email address');
    }

    // Add to provider
    switch (this.provider) {
      case EmailProvider.SENDGRID:
        await sgClient.request({
          method: 'PUT',
          url: '/v3/marketing/contacts',
          body: {
            list_ids: [listId],
            contacts: [{
              email,
              ...metadata
            }]
          }
        });
        break;
    }

    // Update count
    await this.db.query(
      'UPDATE email_lists SET subscriber_count = subscriber_count + 1 WHERE id = $1',
      [listId]
    );
  }

  // Bounce handling
  async processBounce(bounce: BounceInfo): Promise<void> {
    // Mark email as bounced in our database
    await this.db.query(
      `INSERT INTO email_bounces (email, type, reason, channel_id, timestamp)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email, channel_id) 
       DO UPDATE SET type = $2, reason = $3, timestamp = $5`,
      [bounce.email, bounce.type, bounce.reason, this.channelId, bounce.timestamp]
    );

    // Handle based on bounce type
    if (bounce.type === 'hard') {
      // Remove from all lists
      await this.removeFromAllLists(bounce.email);
    }
  }

  private async removeFromAllLists(email: string): Promise<void> {
    // Implementation depends on provider
    this.logger.info(`Removing ${email} from all lists due to hard bounce`);
  }

  private isRetryableError(error: any): boolean {
    // Provider-specific error handling
    const status = error.response?.status || error.statusCode;
    return status === 429 || status >= 500;
  }

  // Template management
  async createTemplate(template: Omit<EmailTemplate, 'id'>): Promise<EmailTemplate> {
    const id = `template_${Date.now()}`;
    
    await this.db.query(
      `INSERT INTO email_templates 
       (id, channel_id, name, subject, mjml_content, html_content, text_content, variables)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        this.channelId,
        template.name,
        template.subject,
        template.mjml,
        template.html,
        template.text,
        JSON.stringify(template.variables)
      ]
    );

    return { id, ...template };
  }

  async updateTemplate(templateId: string, updates: Partial<EmailTemplate>): Promise<void> {
    const updateFields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.name) {
      updateFields.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }

    if (updates.subject) {
      updateFields.push(`subject = $${paramIndex++}`);
      values.push(updates.subject);
    }

    if (updates.mjml) {
      updateFields.push(`mjml_content = $${paramIndex++}`);
      values.push(updates.mjml);
    }

    if (updates.html) {
      updateFields.push(`html_content = $${paramIndex++}`);
      values.push(updates.html);
    }

    values.push(templateId);
    values.push(this.channelId);

    await this.db.query(
      `UPDATE email_templates 
       SET ${updateFields.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex} AND channel_id = $${paramIndex + 1}`,
      values
    );

    // Clear from cache
    this.templates.delete(templateId);
  }
}