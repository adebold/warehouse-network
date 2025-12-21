import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../lib/prisma';

interface HealthCheck {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  services: {
    database: 'connected' | 'disconnected';
    redis?: 'connected' | 'disconnected';
  };
  uptime: number;
  version: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<HealthCheck>) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      services: { database: 'disconnected' },
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
    });
  }

  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;

    const healthCheck: HealthCheck = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
      },
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
    };

    res.status(200).json(healthCheck);
  } catch (error) {
    console.error('Health check failed:', error);

    const healthCheck: HealthCheck = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'disconnected',
      },
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
    };

    res.status(503).json(healthCheck);
  }
}
