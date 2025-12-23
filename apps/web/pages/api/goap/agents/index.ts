/**
 * GOAP Agents API
 * GET /api/goap/agents - List all agents
 * POST /api/goap/agents - Create new agent
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]';
import { goapService } from '../../../../lib/goap/goap-service';
import { AgentType } from '../../../../src/goap/types';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const session = await getServerSession(req, res, authOptions);
    
    if (!session?.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (req.method === 'GET') {
      return handleGetAgents(req, res);
    } else if (req.method === 'POST') {
      return handleCreateAgent(req, res);
    } else {
      return res.status(405).json({ message: 'Method not allowed' });
    }

  } catch (error) {
    console.error('GOAP agents API error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? String(error) : undefined
    });
  }
}

async function handleGetAgents(req: NextApiRequest, res: NextApiResponse) {
  const { warehouseId, type, active } = req.query;

  const agents = await goapService.getAgents({
    warehouseId: warehouseId as string,
    type: type as AgentType,
    active: active ? active === 'true' : undefined
  });

  return res.status(200).json({
    success: true,
    data: agents,
    count: agents.length,
    timestamp: new Date().toISOString()
  });
}

async function handleCreateAgent(req: NextApiRequest, res: NextApiResponse) {
  const { type, name, warehouseId, capabilities } = req.body;

  if (!type || !name || !warehouseId) {
    return res.status(400).json({
      success: false,
      message: 'Missing required fields: type, name, warehouseId'
    });
  }

  const agent = await goapService.createAgent({
    type,
    name,
    warehouseId,
    capabilities: capabilities || []
  });

  return res.status(201).json({
    success: true,
    data: agent,
    message: 'Agent created successfully'
  });
}