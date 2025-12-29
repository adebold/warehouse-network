import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { z } from 'zod';

import { authOptions } from '../auth/[...nextauth]';

import prisma from '@/lib/prisma';
import { logger } from './utils/logger';

const OnboardingStateSchema = z.object({
  flows: z.record(z.object({
    id: z.string(),
    name: z.string(),
    userRole: z.string(),
    steps: z.array(z.object({
      id: z.string(),
      title: z.string(),
      description: z.string(),
      component: z.string(),
      isComplete: z.boolean(),
      isRequired: z.boolean(),
      order: z.number()
    })),
    currentStepIndex: z.number(),
    isComplete: z.boolean(),
    progress: z.number()
  })),
  currentFlow: z.object({
    id: z.string(),
    name: z.string(),
    userRole: z.string(),
    steps: z.array(z.object({
      id: z.string(),
      title: z.string(),
      description: z.string(),
      component: z.string(),
      isComplete: z.boolean(),
      isRequired: z.boolean(),
      order: z.number()
    })),
    currentStepIndex: z.number(),
    isComplete: z.boolean(),
    progress: z.number()
  }).nullable(),
  isOnboardingActive: z.boolean()
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);

  if (!session?.user?.id) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    switch (req.method) {
      case 'GET':
        // Get user's onboarding state
        const user = await prisma.user.findUnique({
          where: { id: session.user.id },
          select: {
            id: true,
            role: true,
            createdAt: true,
            // Add onboarding state field to User model if not exists
            metadata: true // We'll store onboarding state in metadata JSON field
          }
        });

        if (!user) {
          return res.status(404).json({ error: 'User not found' });
        }

        // Extract onboarding state from metadata or return default
        const metadata = user.metadata as any;
        const onboardingState = metadata?.onboardingState || {
          flows: {},
          currentFlow: null,
          isOnboardingActive: false
        };

        return res.status(200).json(onboardingState);

      case 'POST':
        // Save user's onboarding state
        const validatedData = OnboardingStateSchema.parse(req.body);

        // Update user metadata with onboarding state
        await prisma.user.update({
          where: { id: session.user.id },
          data: {
            updatedAt: new Date(),
            // Store in metadata JSON field
            // Note: You may need to add this field to your schema if it doesn't exist
            // For now, we'll create a separate onboarding table
          }
        });

        // Create or update onboarding record
        await prisma.$executeRaw`
          INSERT INTO "UserOnboardingState" (
            "userId", 
            "onboardingData", 
            "createdAt", 
            "updatedAt"
          ) VALUES (
            ${session.user.id}, 
            ${JSON.stringify(validatedData)}::jsonb, 
            NOW(), 
            NOW()
          ) ON CONFLICT ("userId") 
          DO UPDATE SET 
            "onboardingData" = ${JSON.stringify(validatedData)}::jsonb,
            "updatedAt" = NOW()
        `;

        // Track onboarding progress for analytics
        if (validatedData.currentFlow?.isComplete) {
          // Log completion event
          logger.info(`User ${session.user.id} completed onboarding flow: ${validatedData.currentFlow.id}`);
          
          // You could also send to analytics service here
          // await analytics.track({
          //   userId: session.user.id,
          //   event: 'onboarding_flow_completed',
          //   properties: {
          //     flowId: validatedData.currentFlow.id,
          //     flowName: validatedData.currentFlow.name,
          //     completedSteps: validatedData.currentFlow.steps.filter(s => s.isComplete).length,
          //     totalSteps: validatedData.currentFlow.steps.length
          //   }
          // });
        }

        return res.status(200).json({ success: true });

      default:
        res.setHeader('Allow', ['GET', 'POST']);
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    logger.error('Onboarding state API error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid data', 
        details: error.errors 
      });
    }

    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Note: You'll need to add this table to your Prisma schema:
/*
model UserOnboardingState {
  id              String    @id @default(cuid())
  userId          String    @unique
  user            User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  onboardingData  Json
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}
*/