# CRM Integration Guide

## Overview

Marketing Engine integrates with major CRM platforms to sync leads, track conversions, and maintain a unified customer view. This guide covers production-ready integrations with Salesforce, HubSpot, Pipedrive, and custom CRM systems.

## Salesforce Integration

### Prerequisites

1. **Salesforce Edition**: Professional or higher with API access
2. **Connected App**: OAuth 2.0 application configured
3. **API User**: Dedicated integration user with appropriate permissions
4. **API Limits**: Monitor your org's API call limits

### Setup Process

#### Step 1: Create Connected App

```typescript
// Salesforce Setup > App Manager > New Connected App
const connectedAppConfig = {
  name: 'Marketing Engine Integration',
  apiName: 'Marketing_Engine_Integration',
  contactEmail: 'integrations@marketingengine.io',
  oauthSettings: {
    enableOAuth: true,
    callbackUrl: 'https://api.marketingengine.io/oauth/salesforce/callback',
    selectedScopes: [
      'api',           // Access and manage data
      'refresh_token', // Offline access
      'web',          // Access unique user identifiers
      'full'          // Full access (if needed)
    ],
    requireSecret: true,
    enablePKCE: true
  }
};
```

#### Step 2: Configure Integration

```typescript
import { SalesforceIntegration } from '@marketing-engine/integrations';

const salesforce = new SalesforceIntegration({
  // OAuth credentials
  clientId: process.env.SF_CLIENT_ID,
  clientSecret: process.env.SF_CLIENT_SECRET,
  refreshToken: process.env.SF_REFRESH_TOKEN,
  instanceUrl: 'https://your-instance.my.salesforce.com',
  
  // Configuration
  config: {
    apiVersion: 'v57.0',
    syncInterval: 300000, // 5 minutes
    batchSize: 200,
    retryAttempts: 3,
    
    // Field mappings
    fieldMappings: {
      lead: {
        email: 'Email',
        firstName: 'FirstName',
        lastName: 'LastName',
        company: 'Company',
        title: 'Title',
        phone: 'Phone',
        website: 'Website',
        leadSource: 'LeadSource',
        status: 'Status',
        // Custom fields
        utmSource: 'UTM_Source__c',
        utmMedium: 'UTM_Medium__c',
        utmCampaign: 'UTM_Campaign__c',
        marketingScore: 'Marketing_Score__c',
        lastEngagement: 'Last_Engagement_Date__c'
      },
      contact: {
        email: 'Email',
        firstName: 'FirstName',
        lastName: 'LastName',
        accountId: 'AccountId',
        title: 'Title',
        phone: 'Phone',
        mailingAddress: 'MailingAddress'
      },
      opportunity: {
        name: 'Name',
        accountId: 'AccountId',
        amount: 'Amount',
        closeDate: 'CloseDate',
        stageName: 'StageName',
        type: 'Type',
        leadSource: 'LeadSource',
        campaignId: 'CampaignId'
      }
    },
    
    // Sync rules
    syncRules: {
      leadCriteria: "Status != 'Disqualified'",
      contactCriteria: "HasOptedOutOfEmail = false",
      createOrUpdate: true,
      syncDirection: 'bidirectional'
    }
  }
});
```

### Lead Sync Implementation

```typescript
class SalesforceLeadSync {
  private sf: SalesforceIntegration;
  private queue: Queue;
  
  async syncLeadToSalesforce(lead: MarketingLead) {
    try {
      // Check for existing lead
      const existingLead = await this.sf.query(`
        SELECT Id, Email, Status, Owner.Email
        FROM Lead
        WHERE Email = '${lead.email}'
        LIMIT 1
      `);
      
      if (existingLead.records.length > 0) {
        // Update existing lead
        await this.updateLead(existingLead.records[0].Id, lead);
      } else {
        // Create new lead
        await this.createLead(lead);
      }
      
      // Log sync activity
      await this.logSyncActivity(lead, 'success');
      
    } catch (error) {
      // Handle errors
      await this.handleSyncError(lead, error);
    }
  }
  
  private async createLead(lead: MarketingLead) {
    const sfLead = {
      FirstName: lead.firstName,
      LastName: lead.lastName,
      Email: lead.email,
      Company: lead.company || 'Unknown',
      Title: lead.title,
      Phone: lead.phone,
      Website: lead.website,
      LeadSource: this.mapLeadSource(lead.source),
      Status: 'New',
      
      // Custom fields
      UTM_Source__c: lead.utm.source,
      UTM_Medium__c: lead.utm.medium,
      UTM_Campaign__c: lead.utm.campaign,
      Marketing_Score__c: lead.score,
      First_Touch_Date__c: lead.firstTouchDate,
      First_Touch_Channel__c: lead.firstTouchChannel,
      Conversion_Path__c: JSON.stringify(lead.touchpoints),
      
      // Assignment rules
      Assignment_Rule_Header__c: {
        useDefaultRule: true
      }
    };
    
    const result = await this.sf.create('Lead', sfLead);
    
    // Store Salesforce ID
    await this.updateLocalRecord(lead.id, {
      salesforceId: result.id,
      salesforceSyncDate: new Date()
    });
    
    return result;
  }
  
  private async updateLead(sfId: string, lead: MarketingLead) {
    const updates = {
      // Only update changed fields
      ...(lead.score && { Marketing_Score__c: lead.score }),
      ...(lead.lastEngagement && { 
        Last_Engagement_Date__c: lead.lastEngagement,
        Last_Engagement_Type__c: lead.lastEngagementType
      }),
      
      // Append to activity history
      Marketing_Activity_History__c: await this.appendActivity(sfId, lead)
    };
    
    if (Object.keys(updates).length > 0) {
      await this.sf.update('Lead', sfId, updates);
    }
  }
  
  private mapLeadSource(source: string): string {
    const mapping = {
      'linkedin': 'LinkedIn',
      'google': 'Google Ads',
      'organic': 'Web',
      'email': 'Email Campaign',
      'referral': 'Partner Referral',
      'event': 'Trade Show'
    };
    
    return mapping[source] || 'Web';
  }
}
```

### Campaign Member Sync

```typescript
class SalesforceCampaignSync {
  async syncCampaignMembers(campaignId: string, members: CampaignMember[]) {
    // Get or create Salesforce campaign
    const sfCampaign = await this.ensureCampaign(campaignId);
    
    // Batch process members
    const batches = this.chunkArray(members, 200);
    
    for (const batch of batches) {
      const campaignMembers = batch.map(member => ({
        CampaignId: sfCampaign.Id,
        LeadId: member.salesforceLeadId,
        ContactId: member.salesforceContactId,
        Status: this.mapMemberStatus(member.status),
        FirstRespondedDate: member.firstResponseDate,
        HasResponded: member.hasResponded,
        
        // Custom tracking fields
        Engagement_Score__c: member.engagementScore,
        Email_Opens__c: member.emailOpens,
        Email_Clicks__c: member.emailClicks,
        Content_Downloads__c: member.contentDownloads
      }));
      
      await this.sf.createBulk('CampaignMember', campaignMembers);
    }
  }
  
  private async ensureCampaign(marketingCampaignId: string) {
    const campaign = await this.getMarketingCampaign(marketingCampaignId);
    
    // Check if already synced
    const existing = await this.sf.query(`
      SELECT Id, Name, Status
      FROM Campaign
      WHERE Marketing_Campaign_ID__c = '${marketingCampaignId}'
      LIMIT 1
    `);
    
    if (existing.records.length > 0) {
      return existing.records[0];
    }
    
    // Create new campaign
    return await this.sf.create('Campaign', {
      Name: campaign.name,
      Type: this.mapCampaignType(campaign.type),
      Status: 'In Progress',
      StartDate: campaign.startDate,
      EndDate: campaign.endDate,
      BudgetedCost: campaign.budget,
      Description: campaign.description,
      Marketing_Campaign_ID__c: marketingCampaignId,
      
      // Tracking fields
      ExpectedResponse: campaign.expectedLeads,
      Parent: campaign.parentCampaignId
    });
  }
}
```

### Real-time Event Streaming

```typescript
class SalesforceEventStreaming {
  private client: StreamingClient;
  
  async setupPushTopics() {
    // Lead updates push topic
    await this.sf.create('PushTopic', {
      Name: 'MarketingEngineLeadUpdates',
      Query: `SELECT Id, Email, Status, ConvertedDate, ConvertedOpportunityId 
              FROM Lead 
              WHERE SystemModstamp >= LAST_N_DAYS:1`,
      ApiVersion: 57.0,
      NotifyForFields: 'Referenced',
      NotifyForOperationCreate: true,
      NotifyForOperationUpdate: true
    });
    
    // Subscribe to events
    this.client.subscribe('/topic/MarketingEngineLeadUpdates', (message) => {
      this.handleLeadUpdate(message.sobject);
    });
  }
  
  private async handleLeadUpdate(lead: any) {
    if (lead.ConvertedDate) {
      // Lead was converted
      await this.handleLeadConversion(lead);
    } else if (lead.Status === 'Disqualified') {
      // Lead was disqualified
      await this.handleLeadDisqualification(lead);
    }
  }
  
  private async handleLeadConversion(lead: any) {
    // Update marketing engine records
    await this.updateMarketingLead(lead.Email, {
      status: 'converted',
      conversionDate: lead.ConvertedDate,
      opportunityId: lead.ConvertedOpportunityId
    });
    
    // Track conversion in analytics
    await this.trackConversion({
      type: 'lead_to_opportunity',
      leadEmail: lead.Email,
      value: await this.getOpportunityValue(lead.ConvertedOpportunityId),
      attribution: await this.getLeadAttribution(lead.Email)
    });
  }
}
```

## HubSpot Integration

### Setup

```typescript
const hubspot = new HubSpotIntegration({
  apiKey: process.env.HUBSPOT_API_KEY, // Legacy
  accessToken: process.env.HUBSPOT_ACCESS_TOKEN, // OAuth
  portalId: process.env.HUBSPOT_PORTAL_ID,
  
  config: {
    apiVersion: 'v3',
    retryConfig: {
      retries: 3,
      retryDelay: 1000,
      retryCondition: (error) => error.response?.status === 429
    },
    
    propertyMappings: {
      contact: {
        email: 'email',
        firstName: 'firstname',
        lastName: 'lastname',
        company: 'company',
        phone: 'phone',
        website: 'website',
        jobTitle: 'jobtitle',
        // Custom properties
        marketingScore: 'marketing_score',
        leadSource: 'lead_source',
        utmSource: 'utm_source',
        utmMedium: 'utm_medium',
        utmCampaign: 'utm_campaign'
      }
    }
  }
});
```

### Contact Sync

```typescript
class HubSpotContactSync {
  async syncContact(contact: MarketingContact) {
    try {
      // Search for existing contact
      const searchResponse = await this.hubspot.crm.contacts.searchApi.doSearch({
        filterGroups: [{
          filters: [{
            propertyName: 'email',
            operator: 'EQ',
            value: contact.email
          }]
        }]
      });
      
      const properties = this.mapContactProperties(contact);
      
      if (searchResponse.results.length > 0) {
        // Update existing
        await this.hubspot.crm.contacts.basicApi.update(
          searchResponse.results[0].id,
          { properties }
        );
      } else {
        // Create new
        await this.hubspot.crm.contacts.basicApi.create({
          properties,
          associations: await this.getAssociations(contact)
        });
      }
      
      // Sync engagement activities
      await this.syncEngagements(contact);
      
    } catch (error) {
      this.handleHubSpotError(error);
    }
  }
  
  private async syncEngagements(contact: MarketingContact) {
    // Email engagement
    if (contact.emailEngagements) {
      for (const engagement of contact.emailEngagements) {
        await this.hubspot.crm.timeline.eventsApi.create({
          eventTemplateId: 'email_opened',
          objectId: contact.hubspotId,
          tokens: {
            emailSubject: engagement.subject,
            openCount: engagement.opens,
            clickCount: engagement.clicks
          }
        });
      }
    }
    
    // Form submissions
    if (contact.formSubmissions) {
      for (const submission of contact.formSubmissions) {
        await this.createFormSubmission(contact, submission);
      }
    }
  }
}
```

### Custom Objects

```typescript
// Create custom object for marketing campaigns
const campaignObjectSchema = {
  name: 'marketing_campaigns',
  labels: {
    singular: 'Marketing Campaign',
    plural: 'Marketing Campaigns'
  },
  primaryDisplayProperty: 'campaign_name',
  secondaryDisplayProperties: ['status', 'channel'],
  searchableProperties: ['campaign_name', 'campaign_id'],
  requiredProperties: ['campaign_name', 'campaign_id'],
  properties: [
    {
      name: 'campaign_name',
      label: 'Campaign Name',
      type: 'string',
      fieldType: 'text'
    },
    {
      name: 'campaign_id',
      label: 'Campaign ID',
      type: 'string',
      fieldType: 'text'
    },
    {
      name: 'channel',
      label: 'Channel',
      type: 'enumeration',
      options: [
        { label: 'LinkedIn', value: 'linkedin' },
        { label: 'Google Ads', value: 'google' },
        { label: 'Email', value: 'email' }
      ]
    },
    {
      name: 'total_spend',
      label: 'Total Spend',
      type: 'number',
      fieldType: 'number'
    },
    {
      name: 'conversions',
      label: 'Conversions',
      type: 'number',
      fieldType: 'number'
    },
    {
      name: 'roi',
      label: 'ROI',
      type: 'number',
      fieldType: 'number'
    }
  ],
  associatedObjects: ['CONTACT', 'DEAL']
};

// Create the custom object
await hubspot.crm.schemas.coreApi.create(campaignObjectSchema);
```

## Pipedrive Integration

### Configuration

```typescript
const pipedrive = new PipedriveIntegration({
  apiToken: process.env.PIPEDRIVE_API_TOKEN,
  companyDomain: process.env.PIPEDRIVE_DOMAIN,
  
  config: {
    customFields: {
      person: {
        marketingScore: 'abc123',      // Field IDs from Pipedrive
        leadSource: 'def456',
        utmSource: 'ghi789',
        utmMedium: 'jkl012',
        utmCampaign: 'mno345'
      },
      deal: {
        marketingInfluence: 'pqr678',
        attributionPath: 'stu901',
        firstTouchChannel: 'vwx234'
      }
    },
    
    pipeline: {
      defaultPipelineId: 1,
      stages: {
        'new': 1,
        'qualified': 2,
        'proposal': 3,
        'negotiation': 4,
        'won': 5,
        'lost': 6
      }
    }
  }
});
```

### Person and Deal Management

```typescript
class PipedriveSyncManager {
  async syncPerson(lead: MarketingLead) {
    // Check for existing person
    const searchResults = await this.pipedrive.persons.search({
      term: lead.email,
      fields: 'email'
    });
    
    const personData = {
      name: `${lead.firstName} ${lead.lastName}`,
      email: lead.email,
      phone: lead.phone,
      org_id: await this.ensureOrganization(lead.company),
      
      // Custom fields (using field IDs)
      [this.config.customFields.person.marketingScore]: lead.score,
      [this.config.customFields.person.leadSource]: lead.source,
      [this.config.customFields.person.utmSource]: lead.utm.source,
      [this.config.customFields.person.utmMedium]: lead.utm.medium,
      [this.config.customFields.person.utmCampaign]: lead.utm.campaign,
      
      // Notes with marketing history
      notes: this.buildMarketingNotes(lead)
    };
    
    let personId;
    
    if (searchResults.data.items.length > 0) {
      personId = searchResults.data.items[0].item.id;
      await this.pipedrive.persons.update(personId, personData);
    } else {
      const result = await this.pipedrive.persons.add(personData);
      personId = result.data.id;
    }
    
    // Create deal if qualified
    if (lead.status === 'qualified') {
      await this.createDeal(personId, lead);
    }
    
    // Add activities
    await this.syncActivities(personId, lead);
  }
  
  private async createDeal(personId: number, lead: MarketingLead) {
    const dealData = {
      title: `${lead.company} - ${lead.firstName} ${lead.lastName}`,
      person_id: personId,
      org_id: lead.organizationId,
      pipeline_id: this.config.pipeline.defaultPipelineId,
      stage_id: this.config.pipeline.stages[lead.dealStage || 'new'],
      value: lead.estimatedValue,
      currency: 'USD',
      
      // Custom fields
      [this.config.customFields.deal.marketingInfluence]: lead.marketingInfluenceScore,
      [this.config.customFields.deal.attributionPath]: JSON.stringify(lead.touchpoints),
      [this.config.customFields.deal.firstTouchChannel]: lead.firstTouchChannel
    };
    
    const deal = await this.pipedrive.deals.add(dealData);
    
    // Add note with attribution details
    await this.pipedrive.notes.add({
      content: this.buildAttributionNote(lead),
      deal_id: deal.data.id,
      pinned_to_deal_flag: 1
    });
  }
  
  private async syncActivities(personId: number, lead: MarketingLead) {
    for (const activity of lead.activities) {
      await this.pipedrive.activities.add({
        subject: activity.type,
        type: this.mapActivityType(activity.type),
        person_id: personId,
        due_date: activity.date,
        due_time: activity.time,
        duration: activity.duration,
        note: activity.description,
        done: 1
      });
    }
  }
}
```

## Custom CRM Integration

### Generic CRM Adapter

```typescript
interface CRMAdapter {
  name: string;
  authenticate(): Promise<void>;
  searchEntity(entity: string, criteria: any): Promise<any[]>;
  createEntity(entity: string, data: any): Promise<any>;
  updateEntity(entity: string, id: string, data: any): Promise<any>;
  deleteEntity(entity: string, id: string): Promise<void>;
}

class CustomCRMIntegration implements CRMAdapter {
  name = 'CustomCRM';
  private apiClient: AxiosInstance;
  
  constructor(private config: CustomCRMConfig) {
    this.apiClient = axios.create({
      baseURL: config.apiUrl,
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      }
    });
  }
  
  async authenticate() {
    // Implement OAuth or API key validation
    const response = await this.apiClient.get('/auth/validate');
    if (response.status !== 200) {
      throw new Error('Authentication failed');
    }
  }
  
  async searchEntity(entity: string, criteria: any) {
    const response = await this.apiClient.post(`/${entity}/search`, criteria);
    return response.data;
  }
  
  async createEntity(entity: string, data: any) {
    const mappedData = this.mapOutboundData(entity, data);
    const response = await this.apiClient.post(`/${entity}`, mappedData);
    return this.mapInboundData(entity, response.data);
  }
  
  async updateEntity(entity: string, id: string, data: any) {
    const mappedData = this.mapOutboundData(entity, data);
    const response = await this.apiClient.put(`/${entity}/${id}`, mappedData);
    return this.mapInboundData(entity, response.data);
  }
  
  private mapOutboundData(entity: string, data: any) {
    const mapping = this.config.fieldMappings[entity].outbound;
    const mapped: any = {};
    
    for (const [ourField, theirField] of Object.entries(mapping)) {
      if (data[ourField] !== undefined) {
        mapped[theirField] = data[ourField];
      }
    }
    
    return mapped;
  }
  
  private mapInboundData(entity: string, data: any) {
    const mapping = this.config.fieldMappings[entity].inbound;
    const mapped: any = {};
    
    for (const [theirField, ourField] of Object.entries(mapping)) {
      if (data[theirField] !== undefined) {
        mapped[ourField] = data[theirField];
      }
    }
    
    return mapped;
  }
}
```

### Webhook Handler

```typescript
class CRMWebhookHandler {
  private webhookSecret: string;
  private eventHandlers: Map<string, Function>;
  
  constructor(config: WebhookConfig) {
    this.webhookSecret = config.secret;
    this.eventHandlers = new Map();
    this.registerDefaultHandlers();
  }
  
  async handleWebhook(
    headers: any, 
    body: any, 
    signature: string
  ): Promise<void> {
    // Verify webhook signature
    if (!this.verifySignature(body, signature)) {
      throw new Error('Invalid webhook signature');
    }
    
    // Parse event
    const event = this.parseEvent(body);
    
    // Get handler
    const handler = this.eventHandlers.get(event.type);
    if (!handler) {
      console.log(`No handler for event type: ${event.type}`);
      return;
    }
    
    // Process event
    await handler(event);
  }
  
  private verifySignature(payload: any, signature: string): boolean {
    const expectedSignature = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(JSON.stringify(payload))
      .digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }
  
  private registerDefaultHandlers() {
    // Lead conversion
    this.eventHandlers.set('lead.converted', async (event) => {
      await this.trackConversion({
        leadId: event.data.leadId,
        contactId: event.data.contactId,
        opportunityId: event.data.opportunityId,
        conversionDate: event.data.timestamp
      });
    });
    
    // Deal won
    this.eventHandlers.set('deal.won', async (event) => {
      await this.attributeRevenue({
        dealId: event.data.dealId,
        amount: event.data.amount,
        closeDate: event.data.closeDate,
        contactIds: event.data.contactIds
      });
    });
    
    // Contact updated
    this.eventHandlers.set('contact.updated', async (event) => {
      if (event.data.changes.includes('email_opt_out')) {
        await this.updateEmailPreferences({
          contactId: event.data.contactId,
          email: event.data.email,
          optOut: event.data.emailOptOut
        });
      }
    });
  }
  
  registerHandler(eventType: string, handler: Function) {
    this.eventHandlers.set(eventType, handler);
  }
}
```

## Data Sync Strategies

### Real-time Sync

```typescript
class RealTimeSync {
  private syncQueue: Queue;
  private retryQueue: Queue;
  
  async setupRealTimeSync() {
    // Process sync queue
    this.syncQueue.process('crm-sync', async (job) => {
      const { entity, operation, data } = job.data;
      
      try {
        await this.syncToCRM(entity, operation, data);
      } catch (error) {
        // Add to retry queue
        await this.retryQueue.add('crm-retry', {
          ...job.data,
          attempt: (job.data.attempt || 0) + 1,
          lastError: error.message
        }, {
          delay: this.calculateBackoff(job.data.attempt || 0),
          attempts: 5
        });
      }
    });
    
    // Handle retries
    this.retryQueue.process('crm-retry', async (job) => {
      await this.syncToCRM(job.data.entity, job.data.operation, job.data.data);
    });
  }
  
  private calculateBackoff(attempt: number): number {
    // Exponential backoff with jitter
    const baseDelay = 1000; // 1 second
    const maxDelay = 60000; // 1 minute
    const exponentialDelay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
    const jitter = Math.random() * 0.3 * exponentialDelay;
    return Math.round(exponentialDelay + jitter);
  }
}
```

### Batch Sync

```typescript
class BatchSync {
  async performBatchSync(cutoffTime: Date) {
    // Get records to sync
    const recordsToSync = await this.getModifiedRecords(cutoffTime);
    
    // Group by entity type
    const grouped = this.groupByEntity(recordsToSync);
    
    // Sync each entity type
    for (const [entity, records] of Object.entries(grouped)) {
      await this.syncEntityBatch(entity, records);
    }
    
    // Update sync timestamp
    await this.updateSyncTimestamp(new Date());
  }
  
  private async syncEntityBatch(entity: string, records: any[]) {
    const batchSize = 100;
    const batches = this.chunkArray(records, batchSize);
    
    for (const batch of batches) {
      try {
        // Prepare bulk operation
        const bulkOps = batch.map(record => ({
          method: record._syncOperation || 'upsert',
          externalId: this.getExternalId(entity, record),
          data: this.prepareRecordForSync(entity, record)
        }));
        
        // Execute bulk operation
        const results = await this.crmClient.bulk(entity, bulkOps);
        
        // Process results
        await this.processBulkResults(entity, batch, results);
        
      } catch (error) {
        // Handle batch errors
        await this.handleBatchError(entity, batch, error);
      }
    }
  }
}
```

## Monitoring & Observability

### Sync Monitoring

```typescript
class CRMSyncMonitor {
  private metrics: MetricsCollector;
  
  async recordSync(
    entity: string, 
    operation: string, 
    success: boolean, 
    duration: number
  ) {
    // Record metrics
    this.metrics.increment('crm_sync_total', {
      entity,
      operation,
      status: success ? 'success' : 'failure'
    });
    
    this.metrics.histogram('crm_sync_duration', duration, {
      entity,
      operation
    });
    
    // Alert on failures
    if (!success) {
      await this.alertOnFailure(entity, operation);
    }
  }
  
  async getHealthStatus(): Promise<CRMHealthStatus> {
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const stats = await this.db.query(`
      SELECT 
        entity,
        operation,
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'success' THEN 1 END) as successful,
        AVG(duration_ms) as avg_duration,
        MAX(created_at) as last_sync
      FROM crm_sync_log
      WHERE created_at > $1
      GROUP BY entity, operation
    `, [last24h]);
    
    return {
      overallHealth: this.calculateHealth(stats),
      entityHealth: stats.rows.map(row => ({
        entity: row.entity,
        operation: row.operation,
        successRate: (row.successful / row.total) * 100,
        avgDuration: row.avg_duration,
        lastSync: row.last_sync,
        status: row.successful / row.total > 0.95 ? 'healthy' : 'degraded'
      }))
    };
  }
}
```

### Error Recovery

```typescript
class CRMErrorRecovery {
  async handleSyncError(error: any, context: SyncContext) {
    const errorType = this.classifyError(error);
    
    switch (errorType) {
      case 'RATE_LIMIT':
        await this.handleRateLimit(error, context);
        break;
        
      case 'AUTH_FAILURE':
        await this.refreshAuthentication(context);
        break;
        
      case 'FIELD_VALIDATION':
        await this.handleValidationError(error, context);
        break;
        
      case 'NETWORK_ERROR':
        await this.scheduleRetry(context);
        break;
        
      default:
        await this.logUnhandledError(error, context);
    }
  }
  
  private async handleRateLimit(error: any, context: SyncContext) {
    const retryAfter = this.parseRetryAfter(error.headers);
    
    await this.syncQueue.add('crm-sync', context, {
      delay: retryAfter * 1000,
      priority: -1 // Lower priority
    });
    
    await this.metrics.increment('crm_rate_limits', {
      entity: context.entity
    });
  }
}
```

## Best Practices

### Field Mapping Configuration

```yaml
# field-mappings.yaml
salesforce:
  lead:
    # Standard fields
    email: Email
    firstName: FirstName
    lastName: LastName
    company: Company
    
    # Custom fields (use API names)
    marketingScore: Marketing_Score__c
    utmSource: UTM_Source__c
    utmMedium: UTM_Medium__c
    utmCampaign: UTM_Campaign__c
    
    # Computed fields
    fullName:
      type: computed
      formula: "CONCAT(FirstName, ' ', LastName)"
    
    # Picklist mappings
    leadSource:
      type: picklist
      mapping:
        linkedin: "LinkedIn"
        google: "Google Ads"
        organic: "Web"
        email: "Email Campaign"

hubspot:
  contact:
    email: email
    firstName: firstname
    lastName: lastname
    company: company
    
    # HubSpot internal name format
    marketingScore: marketing_score
    utmSource: utm_source
    utmMedium: utm_medium
```

### Deduplication Strategy

```typescript
class CRMDeduplication {
  async findDuplicates(entity: string, record: any): Promise<DuplicateResult> {
    const strategies = this.getDeduplicationStrategies(entity);
    const potentialDuplicates: any[] = [];
    
    for (const strategy of strategies) {
      const matches = await this.searchByStrategy(entity, record, strategy);
      potentialDuplicates.push(...matches);
    }
    
    // Score matches
    const scoredMatches = potentialDuplicates.map(match => ({
      ...match,
      score: this.calculateMatchScore(record, match)
    }));
    
    // Filter by threshold
    const duplicates = scoredMatches.filter(m => m.score > 0.85);
    
    return {
      hasDuplicates: duplicates.length > 0,
      duplicates,
      recommendedAction: this.recommendAction(duplicates)
    };
  }
  
  private getDeduplicationStrategies(entity: string): DedupeStrategy[] {
    return [
      { field: 'email', exact: true },
      { field: 'phone', fuzzy: true, normalize: true },
      { fields: ['firstName', 'lastName', 'company'], fuzzy: true }
    ];
  }
}
```

## Support

For CRM integration support:
- Documentation: https://docs.marketingengine.io/integrations/crm
- Integration Team: integrations@marketingengine.io
- Developer Forum: https://community.marketingengine.io/integrations