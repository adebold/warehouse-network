import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { z } from 'zod';

import { authOptions } from '../auth/[...nextauth]';

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

const ProfileUpdateSchema = z.object({
  companyName: z.string().min(1, 'Company name is required'),
  industry: z.string().min(1, 'Industry is required'),
  companySize: z.string().min(1, 'Company size is required'),
  primaryLocation: z.string().min(1, 'Primary location is required'),
  businessType: z.string().min(1, 'Business type is required'),
  storageNeeds: z.object({
    estimatedPallets: z.string(),
    goodsTypes: z.array(z.string()),
    specialRequirements: z.string().optional(),
  }),
  businessGoals: z.array(z.string()),
  monthlyVolume: z.string().optional(),
  description: z.string().optional()
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);

  if (!session?.user?.id) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    switch (req.method) {
      case 'GET':
        // Get user's profile information
        const user = await prisma.user.findUnique({
          where: { id: session.user.id },
          select: {
            id: true,
            name: true,
            email: true,
            customer: {
              select: {
                id: true,
                name: true
              }
            }
          }
        });

        if (!user) {
          return res.status(404).json({ error: 'User not found' });
        }

        // Get additional profile data from a UserProfile table
        // Note: You may need to add this table to your schema
        const profile = await prisma.$queryRaw<Array<{
          profile_data: any;
        }>>`
          SELECT profile_data 
          FROM "UserProfile" 
          WHERE "userId" = ${session.user.id}
          LIMIT 1
        `;

        const profileData = profile[0]?.profile_data || {};

        return res.status(200).json({
          user,
          profile: profileData
        });

      case 'POST':
        // Update user's profile
        const validatedData = ProfileUpdateSchema.parse(req.body);

        // Start a transaction to update multiple related records
        await prisma.$transaction(async (tx) => {
          // Update or create customer record
          let customer = await tx.customer.findFirst({
            where: { 
              users: { 
                some: { id: session.user.id } 
              } 
            }
          });

          if (!customer) {
            // Create new customer record
            customer = await tx.customer.create({
              data: {
                name: validatedData.companyName,
                users: {
                  connect: { id: session.user.id }
                }
              }
            });

            // Connect user to customer
            await tx.user.update({
              where: { id: session.user.id },
              data: {
                customerId: customer.id,
                name: session.user.name || validatedData.companyName
              }
            });
          } else {
            // Update existing customer
            await tx.customer.update({
              where: { id: customer.id },
              data: {
                name: validatedData.companyName,
                updatedAt: new Date()
              }
            });
          }

          // Store detailed profile information
          // Using raw SQL to handle JSON data
          await tx.$executeRaw`
            INSERT INTO "UserProfile" (
              "userId", 
              "profile_data", 
              "createdAt", 
              "updatedAt"
            ) VALUES (
              ${session.user.id}, 
              ${JSON.stringify(validatedData)}::jsonb, 
              NOW(), 
              NOW()
            ) ON CONFLICT ("userId") 
            DO UPDATE SET 
              "profile_data" = ${JSON.stringify(validatedData)}::jsonb,
              "updatedAt" = NOW()
          `;

          // Create initial preferences based on profile
          await tx.$executeRaw`
            INSERT INTO "UserPreferences" (
              "userId",
              "preferences",
              "createdAt",
              "updatedAt"
            ) VALUES (
              ${session.user.id},
              ${JSON.stringify({
                preferredLocations: [validatedData.primaryLocation],
                goodsTypes: validatedData.storageNeeds.goodsTypes,
                palletRange: validatedData.storageNeeds.estimatedPallets,
                businessGoals: validatedData.businessGoals
              })}::jsonb,
              NOW(),
              NOW()
            ) ON CONFLICT ("userId")
            DO UPDATE SET
              "preferences" = ${JSON.stringify({
                preferredLocations: [validatedData.primaryLocation],
                goodsTypes: validatedData.storageNeeds.goodsTypes,
                palletRange: validatedData.storageNeeds.estimatedPallets,
                businessGoals: validatedData.businessGoals
              })}::jsonb,
              "updatedAt" = NOW()
          `;
        });

        // Track profile completion for analytics
        logger.info(`User ${session.user.id} completed profile setup`);

        // Send welcome email with next steps
        try {
          // You could implement email sending here
          // await sendWelcomeEmail(session.user.email, validatedData.companyName);
        } catch (emailError) {
          logger.error('Failed to send welcome email:', emailError);
          // Don't fail the request if email fails
        }

        return res.status(200).json({ 
          success: true,
          message: 'Profile updated successfully' 
        });

      case 'PUT':
        // Partial profile update
        const partialData = req.body;
        
        await prisma.$executeRaw`
          UPDATE "UserProfile" 
          SET 
            "profile_data" = COALESCE("profile_data", '{}'::jsonb) || ${JSON.stringify(partialData)}::jsonb,
            "updatedAt" = NOW()
          WHERE "userId" = ${session.user.id}
        `;

        return res.status(200).json({ 
          success: true,
          message: 'Profile updated successfully' 
        });

      default:
        res.setHeader('Allow', ['GET', 'POST', 'PUT']);
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    logger.error('Profile API error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid data', 
        details: error.errors 
      });
    }

    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Note: You'll need to add these tables to your Prisma schema:
/*
model UserProfile {
  id           String    @id @default(cuid())
  userId       String    @unique
  user         User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  profile_data Json
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
}

model UserPreferences {
  id          String    @id @default(cuid())
  userId      String    @unique
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  preferences Json
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}

// Also add to User model:
model User {
  // ... existing fields
  profile      UserProfile?
  preferences  UserPreferences?
  onboardingState UserOnboardingState?
}
*/