/**
 * GOAP Goal Assignment API
 * POST /api/goap/goals/assign
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';

import { goapService } from '../../../../lib/goap/goap-service';
import { authOptions } from '../../auth/[...nextauth]';
import { logger } from './utils/logger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    
    if (!session?.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { goal, warehouseId, agentId } = req.body;

    if (!goal) {
      return res.status(400).json({
        success: false,
        message: 'Goal is required'
      });
    }

    // Validate goal structure
    if (!goal.id || !goal.name || !goal.targetState || !goal.priority) {
      return res.status(400).json({
        success: false,
        message: 'Goal must have id, name, targetState, and priority'
      });
    }

    // Add context information
    const enrichedGoal = {
      ...goal,
      requester: session.user.email,
      createdAt: new Date().toISOString(),
      context: {
        ...goal.context,
        warehouseId,
        userId: session.user.email
      }
    };

    // Assign goal to agent or find best agent
    const assignment = await goapService.assignGoal(enrichedGoal, {
      warehouseId,
      specificAgentId: agentId
    });

    if (!assignment) {
      return res.status(400).json({
        success: false,
        message: 'No suitable agent found for this goal'
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        agent: assignment.agent,
        plan: assignment.plan,
        goalId: enrichedGoal.id,
        estimatedDuration: assignment.plan?.estimatedDuration,
        estimatedCost: assignment.plan?.estimatedCost
      },
      message: `Goal assigned to ${assignment.agent.name}`
    });

  } catch (error) {
    logger.error('Goal assignment error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to assign goal',
      error: process.env.NODE_ENV === 'development' ? String(error) : undefined
    });
  }
}