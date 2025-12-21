import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';

type HealthStatus = {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  uptime: number;
  database: 'connected' | 'disconnected' | 'error';
  version: string;
  environment: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse<HealthStatus>) {
  const startTime = process.hrtime();

  // Check database connection
  let dbStatus: 'connected' | 'disconnected' | 'error' = 'disconnected';
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = 'connected';
  } catch (error) {
    console.error('Database health check failed:', error);
    dbStatus = 'error';
  }

  const [seconds, nanoseconds] = process.hrtime(startTime);
  const responseTime = seconds * 1000 + nanoseconds / 1000000;

  const health: HealthStatus = {
    status: dbStatus === 'connected' ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: dbStatus,
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
  };

  // Return appropriate status code
  const statusCode = health.status === 'healthy' ? 200 : 503;

  res.status(statusCode).json(health);
}
