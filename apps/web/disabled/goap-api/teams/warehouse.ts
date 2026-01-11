/**
 * GOAP Warehouse Team Creation API
 * POST /api/goap/teams/warehouse
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';

import { goapService } from '../../../../lib/goap/goap-service';
import { authOptions } from '../../auth/[...nextauth]';
import { logger } from '@/lib/logger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    
    if (!session?.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { warehouseId } = req.body;

    if (!warehouseId) {
      return res.status(400).json({
        success: false,
        message: 'warehouseId is required'
      });
    }

    // Create complete warehouse team
    const team = await goapService.createWarehouseTeam(warehouseId);

    return res.status(201).json({
      success: true,
      data: team,
      message: `Created warehouse team for ${warehouseId}`,
      count: team.length
    });

  } catch (error) {
    logger.error('Warehouse team creation error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create warehouse team',
      error: process.env.NODE_ENV === 'development' ? String(error) : undefined
    });
  }
}