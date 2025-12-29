import { v4 as uuidv4 } from 'uuid';
import { Queue } from 'bullmq';
import { z } from 'zod';
import twilio from 'twilio';
import { database } from '../database';
import { redis } from './redis';
import { logger } from './logger';
import { googleMyBusiness } from './google-my-business';
import { sendgridService } from './sendgrid';
import { twilioService } from './twilio';
import { geoService } from './geo-service';
import { aiService } from './ai-service';
import { Lead, Contractor, Quote } from '../types';

// Lead capture schema
const leadCaptureSchema = z.object({
  source: z.enum(['website', 'google_my_business', 'facebook', 'yelp', 'angi', 'thumbtack', 'referral', 'direct_call', 'trade_show']),
  data: z.object({
    first_name: z.string().min(1).max(100),
    last_name: z.string().min(1).max(100),
    email: z.string().email().optional(),
    phone: z.string().regex(/^\+?1?\d{10,14}$/),
    project_type: z.enum(['kitchen_remodel', 'bathroom_remodel', 'home_addition', 'whole_house', 'exterior', 'flooring', 'painting', 'other']),
    project_description: z.string().optional(),
    budget: z.string().optional(),
    timeline: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().length(2).optional(),
    zip: z.string().regex(/^\d{5}(-\d{4})?$/).optional(),
    referral_source: z.string().optional(),
    utm_source: z.string().optional(),
    utm_medium: z.string().optional(),
    utm_campaign: z.string().optional()
  })
});

export class LeadGenerationService {
  private leadQueue: Queue;
  private responseQueue: Queue;
  private scoringQueue: Queue;
  private twilioClient: twilio.Twilio;

  constructor() {
    this.leadQueue = new Queue('lead-processing', { connection: redis.duplicate() });
    this.responseQueue = new Queue('lead-response', { connection: redis.duplicate() });
    this.scoringQueue = new Queue('lead-scoring', { connection: redis.duplicate() });
    this.twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }

  async captureLead(input: z.infer<typeof leadCaptureSchema>) {
    try {
      // Validate input
      const validated = leadCaptureSchema.parse(input);
      
      logger.info('Capturing new lead', { 
        source: validated.source, 
        projectType: validated.data.project_type 
      });

      // Begin transaction
      const trx = await database.transaction();
      
      try {
        // Parse budget range
        const { min: budgetMin, max: budgetMax } = this.parseBudgetRange(validated.data.budget);
        
        // Geocode address if provided
        let location = null;
        if (validated.data.address && validated.data.city && validated.data.state) {
          const coords = await geoService.geocode({
            address: validated.data.address,
            city: validated.data.city,
            state: validated.data.state,
            zip: validated.data.zip
          });
          
          if (coords) {
            location = database.raw(`ST_SetSRID(ST_MakePoint(?, ?), 4326)`, [coords.lng, coords.lat]);
          }
        }
        
        // Create lead record
        const [lead] = await trx('leads').insert({
          id: uuidv4(),
          first_name: validated.data.first_name,
          last_name: validated.data.last_name,
          email: validated.data.email,
          phone: this.normalizePhone(validated.data.phone),
          source: validated.source,
          source_details: {
            referral: validated.data.referral_source,
            landing_page: validated.data.utm_campaign
          },
          project_type: validated.data.project_type,
          project_description: validated.data.project_description,
          budget_range: validated.data.budget,
          budget_min: budgetMin,
          budget_max: budgetMax,
          timeline: validated.data.timeline,
          address_street: validated.data.address,
          address_city: validated.data.city,
          address_state: validated.data.state,
          address_zip: validated.data.zip,
          location,
          utm_source: validated.data.utm_source,
          utm_medium: validated.data.utm_medium,
          utm_campaign: validated.data.utm_campaign,
          created_at: new Date()
        }).returning('*');
        
        // Find best matching contractor
        const contractor = await this.findBestContractor(lead, trx);
        
        if (contractor) {
          // Assign lead to contractor
          await trx('leads')
            .where('id', lead.id)
            .update({
              contractor_id: contractor.id,
              assigned_at: new Date()
            });
          
          lead.contractor_id = contractor.id;
          
          // Update contractor metrics
          await trx('contractors')
            .where('id', contractor.id)
            .increment('total_leads_received', 1);
        }
        
        // Commit transaction
        await trx.commit();
        
        // Queue immediate response
        await this.responseQueue.add(
          'immediate-response',
          { 
            leadId: lead.id,
            contractorId: contractor?.id
          },
          {
            priority: 1,
            delay: 0
          }
        );
        
        // Queue lead scoring
        await this.scoringQueue.add(
          'score-lead',
          { leadId: lead.id },
          { delay: 1000 }
        );
        
        // Queue follow-up sequence
        await this.queueFollowUpSequence(lead.id);
        
        // Track event
        await this.trackLeadCapture(lead, contractor);
        
        // Get initial score
        const score = await this.calculateInitialScore(lead);
        
        logger.info('Lead captured successfully', {
          leadId: lead.id,
          contractorId: contractor?.id,
          score
        });
        
        return {
          id: lead.id,
          score,
          contractor: contractor ? {
            id: contractor.id,
            name: contractor.business_name,
            response_time: '< 5 minutes'
          } : null,
          next_steps: this.getNextSteps(lead, score)
        };
        
      } catch (error) {
        await trx.rollback();
        throw error;
      }
      
    } catch (error) {
      logger.error('Failed to capture lead', { error, input });
      throw error;
    }
  }

  async processImmediateResponse(leadId: string, contractorId?: string) {
    try {
      const lead = await database('leads')
        .where('id', leadId)
        .first();
        
      if (!lead) {
        throw new Error(`Lead ${leadId} not found`);
      }
      
      const contractor = contractorId ? 
        await database('contractors').where('id', contractorId).first() : 
        null;
      
      // Send immediate acknowledgment
      const promises = [];
      
      // SMS if phone provided
      if (lead.phone) {
        const smsContent = await this.generateSMSResponse(lead, contractor);
        promises.push(this.sendSMS(lead.phone, smsContent, leadId, contractorId));
      }
      
      // Email if provided
      if (lead.email) {
        const emailContent = await this.generateEmailResponse(lead, contractor);
        promises.push(this.sendEmail(lead.email, emailContent, leadId, contractorId));
      }
      
      // Wait for all communications
      await Promise.allSettled(promises);
      
      // Update lead status
      await database('leads')
        .where('id', leadId)
        .update({
          status: 'contacted',
          first_contact_at: new Date(),
          emails_sent: lead.email ? 1 : 0,
          sms_sent: lead.phone ? 1 : 0,
          updated_at: new Date()
        });
      
      // Log communication
      if (lead.phone) {
        await this.logCommunication(leadId, contractorId, {
          type: 'sms',
          direction: 'outbound',
          content: await this.generateSMSResponse(lead, contractor),
          status: 'sent'
        });
      }
      
      if (lead.email) {
        await this.logCommunication(leadId, contractorId, {
          type: 'email',
          direction: 'outbound',
          subject: `Thank you for your ${lead.project_type.replace('_', ' ')} inquiry`,
          content: await this.generateEmailResponse(lead, contractor),
          status: 'sent'
        });
      }
      
      logger.info('Immediate response sent', { leadId, channels: [lead.phone ? 'sms' : null, lead.email ? 'email' : null].filter(Boolean) });
      
    } catch (error) {
      logger.error('Failed to process immediate response', { error, leadId });
      throw error;
    }
  }

  private async findBestContractor(lead: any, trx: any): Promise<any> {
    // Find contractors in service area
    const query = trx('contractors')
      .where('status', 'active')
      .whereRaw('? = ANY(specialties)', [lead.project_type]);
    
    // If we have location, filter by service area
    if (lead.location) {
      query.whereRaw(
        `ST_DWithin(
          location::geography, 
          ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography, 
          service_radius_miles * 1609.34
        )`,
        [lead.location.lng, lead.location.lat]
      );
    } else if (lead.address_zip) {
      // Fallback to zip code matching
      query.whereRaw('? = ANY(service_areas->\'zip_codes\')', [lead.address_zip]);
    }
    
    // Filter by project size if budget provided
    if (lead.budget_min) {
      query.where('min_project_size', '<=', lead.budget_min);
    }
    if (lead.budget_max) {
      query.where('max_project_size', '>=', lead.budget_max);
    }
    
    // Get all matching contractors
    const contractors = await query;
    
    if (contractors.length === 0) {
      return null;
    }
    
    // Score and rank contractors
    const scored = contractors.map(contractor => ({
      ...contractor,
      score: this.scoreContractor(contractor, lead)
    }));
    
    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);
    
    // Check contractor availability/load balancing
    const available = await this.filterByAvailability(scored);
    
    return available[0] || scored[0];
  }

  private scoreContractor(contractor: any, lead: any): number {
    let score = 100;
    
    // Rating weight (40%)
    score += (contractor.average_rating / 5) * 40;
    
    // Review count weight (20%)
    const reviewScore = Math.min(contractor.total_reviews / 50, 1) * 20;
    score += reviewScore;
    
    // Response rate weight (20%)
    const responseRate = contractor.total_quotes_sent / Math.max(contractor.total_leads_received, 1);
    score += responseRate * 20;
    
    // Win rate weight (20%)
    const winRate = contractor.total_jobs_won / Math.max(contractor.total_quotes_sent, 1);
    score += winRate * 20;
    
    // Specialty match bonus
    if (contractor.specialties.includes(lead.project_type)) {
      score += 10;
    }
    
    // Recent activity bonus (active in last 24h)
    const lastActive = new Date(contractor.updated_at);
    const hoursSinceActive = (Date.now() - lastActive.getTime()) / (1000 * 60 * 60);
    if (hoursSinceActive < 24) {
      score += 10;
    }
    
    return score;
  }

  private async filterByAvailability(contractors: any[]): Promise<any[]> {
    const available = [];
    
    for (const contractor of contractors) {
      // Check current lead load
      const activeLeads = await database('leads')
        .where('contractor_id', contractor.id)
        .whereIn('status', ['new', 'contacted', 'qualified'])
        .count('id as count')
        .first();
      
      const leadCount = parseInt(activeLeads?.count || '0');
      
      // Check if under capacity (assuming max 20 active leads)
      if (leadCount < 20) {
        // Check business hours
        if (await this.isWithinBusinessHours(contractor)) {
          available.push(contractor);
        }
      }
    }
    
    return available.length > 0 ? available : contractors;
  }

  private async isWithinBusinessHours(contractor: any): Promise<boolean> {
    const now = new Date();
    const day = now.toLocaleLowerCase().slice(0, 3); // 'mon', 'tue', etc
    
    const hours = contractor.business_hours?.[day];
    if (!hours || !hours.open || !hours.close) {
      return true; // Assume available if no hours set
    }
    
    const currentTime = now.getHours() * 60 + now.getMinutes();
    const [openHour, openMin] = hours.open.split(':').map(Number);
    const [closeHour, closeMin] = hours.close.split(':').map(Number);
    
    const openTime = openHour * 60 + openMin;
    const closeTime = closeHour * 60 + closeMin;
    
    return currentTime >= openTime && currentTime <= closeTime;
  }

  private parseBudgetRange(budget?: string): { min: number | null, max: number | null } {
    if (!budget) return { min: null, max: null };
    
    // Handle common formats: "$10,000-25,000", "Under $50k", "Over $100,000", etc
    const cleaned = budget.replace(/[$,]/g, '');
    
    if (cleaned.includes('-')) {
      const [min, max] = cleaned.split('-').map(s => parseInt(s.trim()) || 0);
      return { min, max };
    }
    
    if (cleaned.toLowerCase().includes('under')) {
      const max = parseInt(cleaned.replace(/\D/g, '')) || 0;
      return { min: 0, max };
    }
    
    if (cleaned.toLowerCase().includes('over')) {
      const min = parseInt(cleaned.replace(/\D/g, '')) || 0;
      return { min, max: null };
    }
    
    // Try to parse as single number
    const value = parseInt(cleaned.replace(/\D/g, '')) || 0;
    return { min: value * 0.8, max: value * 1.2 }; // ±20% range
  }

  private normalizePhone(phone: string): string {
    // Remove all non-digits
    const digits = phone.replace(/\D/g, '');
    
    // Add country code if missing
    if (digits.length === 10) {
      return `+1${digits}`;
    }
    
    if (digits.length === 11 && digits[0] === '1') {
      return `+${digits}`;
    }
    
    return `+${digits}`;
  }

  private async generateSMSResponse(lead: any, contractor: any): Promise<string> {
    const template = `Hi ${lead.first_name}! Thanks for your ${lead.project_type.replace('_', ' ')} inquiry. ${
      contractor ? 
      `${contractor.business_name} has received your request and will contact you within 1 hour.` :
      `We're matching you with the best contractor for your project.`
    } Reply STOP to opt out.`;
    
    return template;
  }

  private async generateEmailResponse(lead: any, contractor: any): Promise<string> {
    // Use AI to generate personalized email
    const prompt = `Generate a professional, warm email response for a ${lead.project_type.replace('_', ' ')} inquiry. 
    Customer name: ${lead.first_name} ${lead.last_name}
    Project description: ${lead.project_description || 'Not provided'}
    Timeline: ${lead.timeline || 'Not specified'}
    Budget: ${lead.budget_range || 'Not specified'}
    ${contractor ? `Contractor assigned: ${contractor.business_name}` : 'Contractor being matched'}
    
    Include:
    - Thank them for their inquiry
    - Set expectations for response time (1 hour if contractor assigned, 2-4 hours if being matched)
    - Mention what happens next
    - Include contractor credentials if assigned (${contractor?.years_in_business} years experience, ${contractor?.average_rating} star rating)
    - Professional closing`;
    
    return await aiService.generateContent(prompt, 'email');
  }

  private async sendSMS(phone: string, content: string, leadId: string, contractorId?: string) {
    try {
      const message = await this.twilioClient.messages.create({
        body: content,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: phone,
        statusCallback: `${process.env.API_URL}/webhooks/twilio/status/${leadId}`
      });
      
      logger.info('SMS sent successfully', { 
        messageId: message.sid, 
        leadId,
        to: phone.slice(0, -4) + '****' 
      });
      
      return message.sid;
    } catch (error) {
      logger.error('Failed to send SMS', { error, leadId });
      throw error;
    }
  }

  private async sendEmail(email: string, content: string, leadId: string, contractorId?: string) {
    try {
      const result = await sendgridService.send({
        to: email,
        subject: 'Thank you for your home renovation inquiry',
        html: content,
        category: 'lead_response',
        customArgs: {
          lead_id: leadId,
          contractor_id: contractorId || ''
        }
      });
      
      logger.info('Email sent successfully', { 
        messageId: result.messageId, 
        leadId,
        to: email 
      });
      
      return result.messageId;
    } catch (error) {
      logger.error('Failed to send email', { error, leadId });
      throw error;
    }
  }

  private async logCommunication(leadId: string, contractorId: string | undefined, data: any) {
    await database('lead_communications').insert({
      id: uuidv4(),
      lead_id: leadId,
      contractor_id: contractorId || null,
      type: data.type,
      direction: data.direction,
      subject: data.subject,
      content: data.content,
      status: data.status,
      sent_at: new Date(),
      created_at: new Date()
    });
  }

  private async calculateInitialScore(lead: any): Promise<number> {
    // This is handled by database trigger, but we can calculate for immediate response
    let score = 0;
    
    // Budget score
    if (lead.budget_min >= 50000) score += 25;
    else if (lead.budget_min >= 25000) score += 15;
    else if (lead.budget_min >= 10000) score += 10;
    
    // Timeline score
    if (['immediate', 'next_30_days'].includes(lead.timeline)) score += 20;
    else if (lead.timeline === 'next_60_days') score += 10;
    
    // Source score
    if (['referral', 'google_my_business'].includes(lead.source)) score += 15;
    else if (['website', 'angi'].includes(lead.source)) score += 10;
    
    // Contact completeness
    if (lead.email && lead.phone) score += 10;
    
    // Project type score (some projects have higher value)
    if (['kitchen_remodel', 'whole_house', 'home_addition'].includes(lead.project_type)) {
      score += 15;
    }
    
    return Math.min(score, 100);
  }

  private getNextSteps(lead: any, score: number): string[] {
    const steps = [];
    
    if (score >= 80) {
      steps.push('Immediate phone call from senior sales rep');
      steps.push('Send premium portfolio package');
      steps.push('Schedule in-person consultation within 24 hours');
    } else if (score >= 60) {
      steps.push('Phone call within 1 hour');
      steps.push('Send standard portfolio');
      steps.push('Schedule consultation within 48 hours');
    } else {
      steps.push('Automated email sequence');
      steps.push('Phone call within 24 hours');
      steps.push('Qualify further before consultation');
    }
    
    return steps;
  }

  private async queueFollowUpSequence(leadId: string) {
    // Schedule follow-up touches
    const touches = [
      { delay: 1 * 60 * 60 * 1000, type: 'first_followup' },      // 1 hour
      { delay: 24 * 60 * 60 * 1000, type: 'day_one_followup' },   // 24 hours
      { delay: 72 * 60 * 60 * 1000, type: 'day_three_followup' }, // 72 hours
      { delay: 7 * 24 * 60 * 60 * 1000, type: 'week_one_followup' } // 7 days
    ];
    
    for (const touch of touches) {
      await this.leadQueue.add(
        touch.type,
        { leadId },
        {
          delay: touch.delay,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000
          }
        }
      );
    }
  }

  private async trackLeadCapture(lead: any, contractor: any) {
    await database('analytics_events').insert({
      id: uuidv4(),
      contractor_id: contractor?.id,
      lead_id: lead.id,
      event_type: 'lead_captured',
      event_category: 'lead_generation',
      event_properties: {
        source: lead.source,
        project_type: lead.project_type,
        budget_range: lead.budget_range,
        timeline: lead.timeline,
        has_email: !!lead.email,
        has_phone: !!lead.phone,
        score: lead.score,
        auto_assigned: !!contractor
      },
      source: lead.utm_source,
      medium: lead.utm_medium,
      campaign: lead.utm_campaign,
      occurred_at: new Date()
    });
  }

  async generateInstantQuote(leadId: string): Promise<Quote> {
    const lead = await database('leads')
      .where('id', leadId)
      .first();
      
    if (!lead) {
      throw new Error(`Lead ${leadId} not found`);
    }
    
    // Use AI to generate quote based on project details
    const quoteData = await aiService.generateQuote({
      projectType: lead.project_type,
      description: lead.project_description,
      budget: lead.budget_range,
      location: {
        city: lead.address_city,
        state: lead.address_state,
        zip: lead.address_zip
      }
    });
    
    // Create quote record
    const quote = await database('quotes').insert({
      id: uuidv4(),
      lead_id: leadId,
      contractor_id: lead.contractor_id,
      quote_number: `Q-${Date.now()}`,
      total_amount: quoteData.total,
      labor_amount: quoteData.labor,
      materials_amount: quoteData.materials,
      tax_amount: quoteData.tax,
      line_items: quoteData.lineItems,
      valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      payment_terms: 'Net 30',
      deposit_required: quoteData.total * 0.3,
      deposit_percentage: 30,
      estimated_duration_days: quoteData.estimatedDays,
      status: 'draft',
      created_at: new Date()
    }).returning('*');
    
    return quote[0];
  }

  // Lead nurturing
  async executeFollowUp(leadId: string, type: string) {
    const lead = await database('leads')
      .where('id', leadId)
      .first();
      
    if (!lead || lead.status === 'won' || lead.status === 'lost') {
      return; // Skip if lead is closed
    }
    
    // Check if lead has engaged
    const hasEngaged = await this.checkLeadEngagement(leadId);
    
    if (hasEngaged && type !== 'first_followup') {
      // Switch to engaged sequence
      await this.switchToEngagedSequence(leadId);
      return;
    }
    
    // Execute appropriate follow-up
    switch (type) {
      case 'first_followup':
        await this.sendFirstFollowUp(lead);
        break;
      case 'day_one_followup':
        await this.sendDayOneFollowUp(lead);
        break;
      case 'day_three_followup':
        await this.sendDayThreeFollowUp(lead);
        break;
      case 'week_one_followup':
        await this.sendWeekOneFollowUp(lead);
        break;
    }
  }

  private async checkLeadEngagement(leadId: string): Promise<boolean> {
    const engagement = await database('lead_communications')
      .where('lead_id', leadId)
      .where('direction', 'inbound')
      .count('id as count')
      .first();
      
    return parseInt(engagement?.count || '0') > 0;
  }

  private async switchToEngagedSequence(leadId: string) {
    // Cancel existing follow-ups
    // Queue engaged sequence with different cadence
    logger.info('Switching to engaged sequence', { leadId });
  }

  private async sendFirstFollowUp(lead: any) {
    // Quick check-in after 1 hour
    if (lead.phone && lead.preferred_contact_method !== 'email') {
      await this.sendSMS(
        lead.phone,
        `Hi ${lead.first_name}, just checking you received our response about your ${lead.project_type.replace('_', ' ')} project. Any questions? Reply YES to schedule a call.`,
        lead.id,
        lead.contractor_id
      );
    }
  }

  private async sendDayOneFollowUp(lead: any) {
    // More detailed follow-up with value
    if (lead.email) {
      const content = await aiService.generateContent(
        `Create a follow-up email for ${lead.first_name} who inquired about ${lead.project_type} yesterday. Include:
        - Check if they received our initial response
        - Share a relevant case study or before/after photos
        - Offer a free consultation or quote
        - Create urgency with current promotion or booking availability`,
        'email'
      );
      
      await this.sendEmail(
        lead.email,
        content,
        lead.id,
        lead.contractor_id
      );
    }
  }

  private async sendDayThreeFollowUp(lead: any) {
    // Address common concerns
    const template = await database('communication_templates')
      .where('type', 'day_three_followup')
      .where('channel', lead.preferred_contact_method || 'email')
      .first();
      
    if (template) {
      const personalized = this.personalizeTemplate(template.content, lead);
      
      if (lead.preferred_contact_method === 'sms' && lead.phone) {
        await this.sendSMS(lead.phone, personalized, lead.id, lead.contractor_id);
      } else if (lead.email) {
        await this.sendEmail(lead.email, personalized, lead.id, lead.contractor_id);
      }
    }
  }

  private async sendWeekOneFollowUp(lead: any) {
    // Last attempt with special offer
    if (lead.score >= 60) {
      // High value lead - personal outreach
      await database('tasks').insert({
        id: uuidv4(),
        type: 'personal_call',
        assigned_to: lead.contractor_id,
        lead_id: lead.id,
        description: `Personal follow-up call for high-value lead: ${lead.first_name} ${lead.last_name}`,
        due_date: new Date(),
        priority: 'high'
      });
    } else {
      // Standard win-back offer
      const offer = await this.generateWinBackOffer(lead);
      
      if (lead.email) {
        await this.sendEmail(
          lead.email,
          offer.content,
          lead.id,
          lead.contractor_id
        );
      }
    }
  }

  private personalizeTemplate(template: string, lead: any): string {
    return template
      .replace(/\{\{first_name\}\}/g, lead.first_name)
      .replace(/\{\{project_type\}\}/g, lead.project_type.replace('_', ' '))
      .replace(/\{\{timeline\}\}/g, lead.timeline || 'your preferred timeline')
      .replace(/\{\{city\}\}/g, lead.address_city || 'your area');
  }

  private async generateWinBackOffer(lead: any) {
    return {
      content: `Hi ${lead.first_name}, we noticed you were looking for ${lead.project_type.replace('_', ' ')} services. 
      This week only, we're offering 15% off for new customers. Would you like to schedule a free consultation?`,
      offer_type: 'percentage_discount',
      offer_value: 15,
      expires_in_days: 7
    };
  }
}

export const leadGeneration = new LeadGenerationService();