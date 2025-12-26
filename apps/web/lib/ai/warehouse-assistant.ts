/**
 * Warehouse AI Assistant - Production Implementation
 * Simple, practical AI for the warehouse marketplace MVP
 */

import { z } from 'zod';
import prisma from '@/lib/prisma';

// ========================================
// TYPES
// ========================================

export interface SearchIntent {
  location?: string;
  sqft?: number;
  minSqft?: number;
  maxSqft?: number;
  priceRange?: { min?: number; max?: number };
  features?: string[];
  moveInDate?: Date;
  duration?: number;
}

export interface LeadScore {
  score: number; // 0-100
  reasons: string[];
  urgency: 'low' | 'medium' | 'high';
  estimatedValue: number;
}

export interface ListingStage {
  stage: 'start' | 'location' | 'size' | 'pricing' | 'features' | 'description' | 'photos' | 'complete';
  data: Record<string, any>;
}

// ========================================
// MAIN ASSISTANT CLASS
// ========================================

export class WarehouseAssistant {
  private readonly CLAUDE_API_KEY = process.env.ANTHROPIC_API_KEY!;
  
  /**
   * Process any user message and return appropriate response
   */
  async processMessage(
    message: string, 
    userId?: string,
    context?: any
  ): Promise<{
    response: string;
    actionType?: string;
    data?: any;
  }> {
    // Detect intent
    const intent = this.detectIntent(message);
    
    switch (intent.type) {
      case 'search':
        return await this.handleSearch(message, intent.params, userId);
        
      case 'pricing':
        return await this.handlePricing(message, intent.params);
        
      case 'listing':
        return await this.handleListing(message, userId, context);
        
      case 'contact':
        return await this.handleContact(message, intent.params, userId);
        
      default:
        return {
          response: this.getGeneralResponse(message),
          actionType: 'general'
        };
    }
  }
  
  /**
   * Simple intent detection
   */
  private detectIntent(message: string): { type: string; params: any } {
    const lower = message.toLowerCase();
    
    // Search intent
    if (lower.includes('need') || lower.includes('looking for') || 
        lower.includes('find') || lower.includes('search')) {
      return {
        type: 'search',
        params: this.extractSearchParams(message)
      };
    }
    
    // Pricing intent
    if (lower.includes('cost') || lower.includes('price') || 
        lower.includes('how much') || lower.includes('rate')) {
      return {
        type: 'pricing',
        params: this.extractPricingParams(message)
      };
    }
    
    // Listing intent
    if (lower.includes('list') || lower.includes('rent out') || 
        lower.includes('have a warehouse')) {
      return {
        type: 'listing',
        params: {}
      };
    }
    
    // Contact intent
    if (lower.includes('contact') || lower.includes('email') || 
        lower.includes('call') || lower.includes('interested in')) {
      return {
        type: 'contact',
        params: this.extractContactParams(message)
      };
    }
    
    return { type: 'general', params: {} };
  }
  
  /**
   * Handle warehouse search
   */
  private async handleSearch(
    message: string, 
    params: SearchIntent,
    userId?: string
  ): Promise<any> {
    // Search database
    const warehouses = await this.searchWarehouses(params);
    
    if (warehouses.length === 0) {
      return {
        response: `I couldn't find any warehouses matching your criteria in ${params.location || 'that area'}. Would you like me to:\n\n• Expand the search area?\n• Adjust the size requirements?\n• Show all available warehouses?`,
        actionType: 'no_results'
      };
    }
    
    // Format results
    let response = `I found ${warehouses.length} warehouse${warehouses.length > 1 ? 's' : ''} matching your needs:\n\n`;
    
    const topResults = warehouses.slice(0, 3);
    topResults.forEach((warehouse, i) => {
      response += `**${i + 1}. ${warehouse.name || `${warehouse.size.toLocaleString()} sqft Warehouse`}**\n`;
      response += `📍 ${warehouse.city}, ${warehouse.state}\n`;
      response += `📐 ${warehouse.size.toLocaleString()} sqft\n`;
      response += `💰 $${warehouse.pricePerSqft}/sqft = $${(warehouse.size * warehouse.pricePerSqft).toLocaleString()}/month\n`;
      
      if (warehouse.features?.length > 0) {
        response += `✓ ${warehouse.features.slice(0, 3).join(' • ')}\n`;
      }
      
      response += `🔗 [View Details](/warehouses/${warehouse.id})\n\n`;
    });
    
    if (warehouses.length > 3) {
      response += `Plus ${warehouses.length - 3} more warehouses. [View all results](/search?${new URLSearchParams(params as any)})`;
    }
    
    // Track search for analytics
    if (userId) {
      await this.trackSearch(userId, params, warehouses.length);
    }
    
    return {
      response,
      actionType: 'search_results',
      data: {
        warehouses: topResults,
        totalCount: warehouses.length,
        searchParams: params
      }
    };
  }
  
  /**
   * Handle pricing questions
   */
  private async handlePricing(message: string, params: any): Promise<any> {
    const { sqft, location, duration } = params;
    
    if (!sqft) {
      return {
        response: "To calculate pricing, please tell me how many square feet you need. For example: 'What's the price for 5,000 sqft?'",
        actionType: 'need_info'
      };
    }
    
    // Get market pricing
    const avgPrice = await this.getMarketPricing(location);
    const monthlyBase = sqft * avgPrice;
    
    let response = `**Pricing for ${sqft.toLocaleString()} sqft in ${location || 'your area'}:**\n\n`;
    response += `📊 Market rate: $${avgPrice.toFixed(2)}/sqft/month\n`;
    response += `💵 Monthly cost: $${monthlyBase.toLocaleString()}\n\n`;
    
    // Add term discounts
    response += `**Save with longer terms:**\n`;
    response += `• 3-5 months: Standard rate\n`;
    response += `• 6-11 months: 5% off = $${(monthlyBase * 0.95).toLocaleString()}/month\n`;
    response += `• 12+ months: 10% off = $${(monthlyBase * 0.90).toLocaleString()}/month\n\n`;
    
    if (duration && duration >= 6) {
      const discount = duration >= 12 ? 0.10 : 0.05;
      const discountedRate = monthlyBase * (1 - discount);
      const totalSavings = (monthlyBase * duration) - (discountedRate * duration);
      
      response += `**Your ${duration}-month lease:**\n`;
      response += `• Monthly: $${discountedRate.toLocaleString()} (${discount * 100}% off)\n`;
      response += `• Total: $${(discountedRate * duration).toLocaleString()}\n`;
      response += `• You save: $${totalSavings.toLocaleString()}! 🎉\n`;
    }
    
    response += `\n[Search available warehouses](/search?sqft=${sqft}&location=${location || ''})`;
    
    return {
      response,
      actionType: 'pricing_info',
      data: {
        sqft,
        location,
        avgPrice,
        monthlyBase
      }
    };
  }
  
  /**
   * Handle listing creation
   */
  private async handleListing(
    message: string, 
    userId?: string,
    context?: ListingStage
  ): Promise<any> {
    if (!userId) {
      return {
        response: "To list your warehouse, please [sign in](/auth/signin) or [create an account](/auth/signup). It only takes a minute!",
        actionType: 'auth_required'
      };
    }
    
    const stage = context?.stage || 'start';
    
    switch (stage) {
      case 'start':
        return {
          response: `Great! I'll help you create a listing that attracts quality renters. Let's start with the basics:\n\n**📍 Step 1: Location**\nWhat's the address of your warehouse? (City and state is fine for now)`,
          actionType: 'listing_flow',
          data: { stage: 'location' }
        };
        
      case 'location':
        const location = this.extractLocation(message);
        return {
          response: `Perfect! ${location} is a great market. Now:\n\n**📐 Step 2: Size**\nHow many total square feet is your warehouse?`,
          actionType: 'listing_flow',
          data: { 
            stage: 'size',
            location
          }
        };
        
      case 'size':
        const sqft = this.extractNumber(message);
        const marketPrice = await this.getMarketPricing(context?.data?.location || '');
        return {
          response: `${sqft.toLocaleString()} sqft - nice size! Based on similar warehouses in ${context?.data?.location || 'your area'}, the average rate is $${marketPrice}/sqft.\n\n**💰 Step 3: Pricing**\nWhat rate per sqft would you like to charge? (Suggested: $${(marketPrice * 0.95).toFixed(2)}-$${(marketPrice * 1.05).toFixed(2)})`,
          actionType: 'listing_flow',
          data: {
            stage: 'pricing',
            ...(context?.data || {}),
            sqft
          }
        };
        
      case 'pricing':
        const price = this.extractPrice(message);
        return {
          response: `Great pricing! Now let's highlight what makes your warehouse special.\n\n**✨ Step 4: Features**\nWhich of these features does your warehouse have? (Reply with numbers)\n\n1. Loading docks\n2. Drive-in doors\n3. Climate control\n4. 24/7 access\n5. Security system\n6. Forklift/equipment\n7. Racking system\n8. Office space\n9. Parking\n10. Near highway`,
          actionType: 'listing_flow',
          data: {
            stage: 'features',
            ...(context?.data || {}),
            pricePerSqft: price
          }
        };
        
      case 'features':
        const features = this.extractFeatures(message);
        const listing = await this.generateListing(context?.data || {}, features);
        return {
          response: listing,
          actionType: 'listing_preview',
          data: {
            stage: 'complete',
            ...(context?.data || {}),
            features
          }
        };
        
      default:
        return {
          response: "Let's create your warehouse listing! Just say 'list my warehouse' to start.",
          actionType: 'listing_help'
        };
    }
  }
  
  /**
   * Handle contact requests
   */
  private async handleContact(
    message: string, 
    params: any,
    userId?: string
  ): Promise<any> {
    const warehouseId = params.warehouseId;
    
    if (!warehouseId) {
      return {
        response: "Which warehouse are you interested in? Please share the listing link or tell me more about what you're looking for.",
        actionType: 'need_warehouse_id'
      };
    }
    
    if (!userId) {
      return {
        response: "Please [sign in](/auth/signin) to contact warehouse owners. It's free and only takes a minute!",
        actionType: 'auth_required'
      };
    }
    
    // Create lead and score it
    const lead = await this.createLead(warehouseId, userId, message);
    const score = await this.scoreLead(lead);
    
    // Notify warehouse owner
    await this.notifyOwner(warehouseId, lead, score);
    
    return {
      response: `✅ **Message sent!**\n\nThe warehouse owner has been notified and typically responds within 24 hours.\n\n**What happens next:**\n1. Owner reviews your inquiry\n2. They'll email you directly to discuss\n3. You can schedule a tour if interested\n\nMeanwhile, here are similar warehouses you might like:\n[View similar options](/warehouses/${warehouseId}/similar)`,
      actionType: 'contact_sent',
      data: {
        leadId: lead.id,
        warehouseId
      }
    };
  }
  
  // ========================================
  // HELPER METHODS
  // ========================================
  
  private extractSearchParams(message: string): SearchIntent {
    const params: SearchIntent = {};
    
    // Extract sqft
    const sqftMatch = message.match(/(\d{1,3},?\d{3,6}|\d{3,6})\s*(sq|square)?\s*f/i);
    if (sqftMatch) {
      params.sqft = parseInt(sqftMatch[1].replace(',', ''));
      params.minSqft = Math.floor(params.sqft * 0.8);
      params.maxSqft = Math.floor(params.sqft * 1.2);
    }
    
    // Extract location
    params.location = this.extractLocation(message);
    
    // Extract duration
    const durationMatch = message.match(/(\d{1,2})\s*month/i);
    if (durationMatch) {
      params.duration = parseInt(durationMatch[1]);
    }
    
    // Extract features
    const features = [];
    if (message.toLowerCase().includes('climate')) features.push('climate_control');
    if (message.toLowerCase().includes('dock')) features.push('loading_dock');
    if (message.toLowerCase().includes('24/7')) features.push('24_7_access');
    if (message.toLowerCase().includes('security')) features.push('security');
    
    if (features.length > 0) {
      params.features = features;
    }
    
    return params;
  }
  
  private extractPricingParams(message: string): any {
    return {
      sqft: this.extractNumber(message),
      location: this.extractLocation(message),
      duration: this.extractDuration(message)
    };
  }
  
  private extractContactParams(message: string): any {
    // Extract warehouse ID from message if present
    const idMatch = message.match(/warehouse[\/\-]?(\w+)/i);
    return {
      warehouseId: idMatch?.[1],
      message
    };
  }
  
  private extractLocation(message: string): string | undefined {
    // Major cities - expand this list
    const cities = [
      'chicago', 'los angeles', 'new york', 'houston', 'phoenix',
      'philadelphia', 'san antonio', 'san diego', 'dallas', 'san jose',
      'austin', 'jacksonville', 'fort worth', 'columbus', 'charlotte',
      'san francisco', 'indianapolis', 'seattle', 'denver', 'washington'
    ];
    
    for (const city of cities) {
      if (message.toLowerCase().includes(city)) {
        return city.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      }
    }
    
    // Check for state codes
    const stateMatch = message.match(/\b([A-Z]{2})\b/);
    if (stateMatch) {
      return stateMatch[1];
    }
    
    return undefined;
  }
  
  private extractNumber(message: string): number {
    const match = message.match(/(\d{1,3},?\d{3,6}|\d{3,6})/);
    return match ? parseInt(match[1].replace(',', '')) : 0;
  }
  
  private extractDuration(message: string): number | undefined {
    const match = message.match(/(\d{1,2})\s*month/i);
    return match ? parseInt(match[1]) : undefined;
  }
  
  private extractPrice(message: string): number {
    const match = message.match(/\$?(\d+\.?\d*)/);
    return match ? parseFloat(match[1]) : 0;
  }
  
  private extractFeatures(message: string): string[] {
    const features: string[] = [];
    const featureMap = {
      '1': 'loading_dock',
      '2': 'drive_in',
      '3': 'climate_control',
      '4': '24_7_access',
      '5': 'security',
      '6': 'equipment',
      '7': 'racking',
      '8': 'office',
      '9': 'parking',
      '10': 'highway_access'
    };
    
    // Check for numbers
    Object.entries(featureMap).forEach(([num, feature]) => {
      if (message.includes(num)) {
        features.push(feature);
      }
    });
    
    return features;
  }
  
  private getGeneralResponse(message: string): string {
    const lower = message.toLowerCase();
    
    if (lower.includes('hello') || lower.includes('hi')) {
      return `Hello! I'm here to help you find warehouse space or list your warehouse. What can I help you with today?`;
    }
    
    if (lower.includes('thank')) {
      return `You're welcome! Is there anything else I can help you with?`;
    }
    
    return `I can help you:\n\n• 🔍 **Find warehouse space** - Tell me size and location\n• 💰 **Check pricing** - Get instant cost estimates  \n• 📝 **List your warehouse** - I'll guide you step-by-step\n• 📧 **Contact owners** - Connect with warehouse owners\n\nWhat would you like to do?`;
  }
  
  // ========================================
  // DATABASE METHODS
  // ========================================
  
  private async searchWarehouses(params: SearchIntent): Promise<any[]> {
    const where: any = {
      available: true
    };
    
    if (params.minSqft || params.maxSqft) {
      where.size = {};
      if (params.minSqft) where.size.gte = params.minSqft;
      if (params.maxSqft) where.size.lte = params.maxSqft;
    }
    
    if (params.location) {
      where.OR = [
        { city: { contains: params.location, mode: 'insensitive' } },
        { state: { contains: params.location, mode: 'insensitive' } }
      ];
    }
    
    if (params.priceRange) {
      where.pricePerSqft = {};
      if (params.priceRange.min) where.pricePerSqft.gte = params.priceRange.min;
      if (params.priceRange.max) where.pricePerSqft.lte = params.priceRange.max;
    }
    
    const warehouses = await prisma.warehouse.findMany({
      where,
      include: {
        features: true,
        images: true
      },
      orderBy: [
        { featured: 'desc' },
        { pricePerSqft: 'asc' }
      ],
      take: 20
    });
    
    return warehouses;
  }
  
  private async getMarketPricing(location?: string): Promise<number> {
    if (!location) return 4.00; // Default
    
    // Get average pricing for location
    const avg = await prisma.warehouse.aggregate({
      where: {
        available: true,
        OR: [
          { city: { contains: location, mode: 'insensitive' } },
          { state: { contains: location, mode: 'insensitive' } }
        ]
      },
      _avg: {
        pricePerSqft: true
      }
    });
    
    return avg._avg.pricePerSqft || 4.00;
  }
  
  private async trackSearch(userId: string, params: SearchIntent, resultCount: number): Promise<void> {
    await prisma.searchHistory.create({
      data: {
        userId,
        query: JSON.stringify(params),
        resultCount,
        timestamp: new Date()
      }
    });
  }
  
  private async createLead(warehouseId: string, userId: string, message: string): Promise<any> {
    return await prisma.lead.create({
      data: {
        warehouseId,
        userId,
        message,
        status: 'new',
        createdAt: new Date()
      }
    });
  }
  
  private async scoreLead(lead: any): Promise<LeadScore> {
    let score = 50; // Base score
    const reasons = [];
    
    // Score based on message length and quality
    if (lead.message.length > 100) {
      score += 10;
      reasons.push('Detailed inquiry');
    }
    
    // Get user info for scoring
    const user = await prisma.user.findUnique({
      where: { id: lead.userId },
      include: {
        company: true,
        searchHistory: {
          take: 10,
          orderBy: { timestamp: 'desc' }
        }
      }
    });
    
    if (user?.company) {
      score += 15;
      reasons.push('Verified company');
    }
    
    if (user?.searchHistory.length > 5) {
      score += 10;
      reasons.push('Active searcher');
    }
    
    // Calculate urgency
    let urgency: 'low' | 'medium' | 'high' = 'medium';
    if (score >= 75) urgency = 'high';
    else if (score < 60) urgency = 'low';
    
    // Estimate value (placeholder)
    const estimatedValue = 5000 * 4 * 6; // 5k sqft * $4 * 6 months
    
    return {
      score: Math.min(100, score),
      reasons,
      urgency,
      estimatedValue
    };
  }
  
  private async notifyOwner(warehouseId: string, lead: any, score: LeadScore): Promise<void> {
    // Get warehouse and owner
    const warehouse = await prisma.warehouse.findUnique({
      where: { id: warehouseId },
      include: { owner: true }
    });
    
    if (!warehouse?.owner) return;
    
    // Create notification
    await prisma.notification.create({
      data: {
        userId: warehouse.owner.id,
        type: 'new_lead',
        title: `New ${score.urgency === 'high' ? 'HOT' : ''} lead for ${warehouse.name}`,
        message: `Lead score: ${score.score}/100. ${lead.message.substring(0, 100)}...`,
        data: JSON.stringify({
          leadId: lead.id,
          warehouseId,
          score
        })
      }
    });
    
    // Send email (implement your email service)
    // await sendEmail(warehouse.owner.email, 'new-lead', { lead, score, warehouse });
  }
  
  private async generateListing(data: any, features: string[]): Promise<string> {
    const monthlyRent = data.sqft * data.pricePerSqft;
    const featureList = features.map(f => 
      f.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
    );
    
    return `**🎉 Your listing is ready! Here's a preview:**

---

# ${data.sqft.toLocaleString()} sqft Warehouse in ${data.location}

**💰 $${data.pricePerSqft}/sqft/month** • Total: $${monthlyRent.toLocaleString()}/month

## ✨ Features
${featureList.map(f => `• ${f}`).join('\n')}

## 📝 Description
This ${data.sqft.toLocaleString()} sqft warehouse in ${data.location} offers excellent value for businesses looking for quality storage and distribution space. ${features.includes('climate_control') ? 'Climate-controlled environment ensures your goods stay in perfect condition year-round.' : ''} ${features.includes('24_7_access') ? 'With 24/7 access, you can operate on your schedule.' : ''}

Perfect for:
• E-commerce fulfillment
• Distribution operations
• Manufacturing storage
• Seasonal inventory
• Business expansion

**Available immediately** with flexible lease terms starting at 3 months.

---

**Ready to publish?** 
1. ✅ Publish now
2. 📝 Edit description  
3. 📸 Add photos (recommended - listings with photos get 3x more inquiries!)

Just reply with your choice!`;
  }
}

// ========================================
// SINGLETON INSTANCE
// ========================================

export const warehouseAssistant = new WarehouseAssistant();