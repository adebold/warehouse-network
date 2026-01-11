/**
 * AI Chat API Endpoint
 * Handles all AI assistant interactions
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { z } from 'zod';

import { authOptions } from '../auth/[...nextauth]';

import { warehouseAssistant } from '@/lib/ai/warehouse-assistant';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';

// Request validation
const chatRequestSchema = z.object({
  message: z.string().min(1).max(1000),
  context: z.any().optional()
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get user session (optional - AI works for anonymous users too)
    const session = await getServerSession(req, res, authOptions);
    const userId = session?.user?.id;
    
    // Validate request
    const result = chatRequestSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ 
        error: 'Invalid request',
        details: result.error.errors 
      });
    }
    
    const { message, context } = result.data;
    
    // Rate limiting for anonymous users
    if (!userId) {
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
      const rateLimitKey = `ai_chat_${ip}`;
      
      // Simple in-memory rate limiting (use Redis in production)
      const recentRequests = await checkRateLimit(rateLimitKey);
      if (recentRequests > 10) {
        return res.status(429).json({ 
          error: 'Too many requests. Please sign in for unlimited access.' 
        });
      }
    }
    
    // Process message with AI
    const response = await warehouseAssistant.processMessage(
      message,
      userId,
      context
    );
    
    // Log interaction for analytics
    await logInteraction(userId, message, response);
    
    // Return response
    res.status(200).json({
      success: true,
      response: response.response,
      actionType: response.actionType,
      data: response.data
    });
    
  } catch (error) {
    logger.error('AI Chat Error:', error);
    res.status(500).json({ 
      error: 'Something went wrong. Please try again.' 
    });
  }
}

// Simple rate limiting (use Redis in production)
const rateLimitStore = new Map<string, number[]>();

async function checkRateLimit(key: string): Promise<number> {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 hour
  
  const timestamps = rateLimitStore.get(key) || [];
  const recentTimestamps = timestamps.filter(t => now - t < windowMs);
  
  recentTimestamps.push(now);
  rateLimitStore.set(key, recentTimestamps);
  
  return recentTimestamps.length;
}

// Log interactions for analytics
async function logInteraction(
  userId: string | undefined,
  message: string,
  response: any
): Promise<void> {
  try {
    await prisma.aiInteraction.create({
      data: {
        userId,
        message: message.substring(0, 500), // Truncate long messages
        response: response.response.substring(0, 500),
        actionType: response.actionType,
        metadata: response.data ? JSON.stringify(response.data) : null,
        timestamp: new Date()
      }
    });
  } catch (error) {
    logger.error('Failed to log AI interaction:', error);
    // Don't fail the request if logging fails
  }
}