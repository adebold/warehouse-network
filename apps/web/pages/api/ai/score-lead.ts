/**
 * Lead Scoring API
 * Automatically scores leads when they contact warehouse owners
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const scoreLeadSchema = z.object({
  warehouseId: z.string(),
  message: z.string(),
  sqftNeeded: z.number().optional(),
  moveInDate: z.string().optional(),
  duration: z.number().optional(),
  company: z.string().optional()
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const result = scoreLeadSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    const leadData = result.data;
    
    // Calculate lead score
    let score = 50; // Base score
    const reasons: string[] = [];
    
    // Score based on specificity
    if (leadData.sqftNeeded) {
      score += 10;
      reasons.push('Specific space requirements');
    }
    
    // Score based on urgency
    if (leadData.moveInDate) {
      const moveIn = new Date(leadData.moveInDate);
      const daysUntilMove = Math.floor((moveIn.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      
      if (daysUntilMove < 30) {
        score += 20;
        reasons.push('Urgent need (< 30 days)');
      } else if (daysUntilMove < 60) {
        score += 10;
        reasons.push('Near-term need (< 60 days)');
      }
    }
    
    // Score based on lease length
    if (leadData.duration) {
      if (leadData.duration >= 12) {
        score += 15;
        reasons.push('Long-term lease (12+ months)');
      } else if (leadData.duration >= 6) {
        score += 10;
        reasons.push('Medium-term lease (6+ months)');
      }
    }
    
    // Score based on company info
    if (leadData.company) {
      score += 10;
      reasons.push('Company information provided');
    }
    
    // Score based on message quality
    const messageWords = leadData.message.split(' ').length;
    if (messageWords > 50) {
      score += 5;
      reasons.push('Detailed requirements');
    }
    
    // Get user history
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: {
        _count: {
          select: {
            leads: true,
            searches: true
          }
        }
      }
    });
    
    if (user) {
      if (user._count.searches > 5) {
        score += 5;
        reasons.push('Active searcher');
      }
      
      if (user.emailVerified) {
        score += 5;
        reasons.push('Verified email');
      }
    }
    
    // Cap at 100
    score = Math.min(100, score);
    
    // Determine urgency level
    let urgency: 'low' | 'medium' | 'high' = 'medium';
    if (score >= 80) urgency = 'high';
    else if (score < 60) urgency = 'low';
    
    // Calculate estimated value
    const warehouse = await prisma.warehouse.findUnique({
      where: { id: leadData.warehouseId },
      select: { pricePerSqft: true }
    });
    
    const estimatedMonthlyValue = (leadData.sqftNeeded || 5000) * (warehouse?.pricePerSqft || 4);
    const estimatedTotalValue = estimatedMonthlyValue * (leadData.duration || 6);
    
    // Create the lead record
    const lead = await prisma.lead.create({
      data: {
        warehouseId: leadData.warehouseId,
        userId: session.user.id,
        message: leadData.message,
        score,
        urgency,
        estimatedValue: estimatedTotalValue,
        metadata: {
          sqftNeeded: leadData.sqftNeeded,
          moveInDate: leadData.moveInDate,
          duration: leadData.duration,
          company: leadData.company,
          scoreReasons: reasons
        }
      },
      include: {
        warehouse: {
          select: {
            name: true,
            owner: {
              select: {
                email: true,
                name: true
              }
            }
          }
        }
      }
    });
    
    // Send notification to warehouse owner
    if (lead.warehouse.owner) {
      await prisma.notification.create({
        data: {
          userId: lead.warehouse.ownerId,
          type: urgency === 'high' ? 'hot_lead' : 'new_lead',
          title: `New ${urgency === 'high' ? 'HOT' : ''} lead for ${lead.warehouse.name}`,
          message: `Lead score: ${score}/100. ${leadData.sqftNeeded || 'Unknown'} sqft needed. Click to view details.`,
          link: `/dashboard/leads/${lead.id}`,
          metadata: {
            leadId: lead.id,
            score,
            urgency
          }
        }
      });
      
      // Send email for high-score leads
      if (score >= 80) {
        // await sendEmail({
        //   to: lead.warehouse.owner.email,
        //   subject: `🔥 HOT Lead - ${leadData.sqftNeeded || 'Unknown'} sqft needed`,
        //   template: 'hot-lead',
        //   data: {
        //     lead,
        //     score,
        //     reasons,
        //     warehouse: lead.warehouse
        //   }
        // });
      }
    }
    
    res.status(200).json({
      leadId: lead.id,
      score,
      urgency,
      estimatedValue: estimatedTotalValue,
      reasons
    });
    
  } catch (error) {
    console.error('Lead scoring error:', error);
    res.status(500).json({ error: 'Failed to score lead' });
  }
}