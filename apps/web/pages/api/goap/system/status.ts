/**
 * GOAP System Status API
 * GET /api/goap/system/status
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]';
import { goapService } from '../../../../lib/goap/goap-service';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    
    if (!session?.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Get GOAP system status
    const status = await goapService.getSystemStatus();
    
    return res.status(200).json({
      success: true,
      data: status,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('GOAP system status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get system status',
      error: process.env.NODE_ENV === 'development' ? String(error) : undefined
    });
  }
}