import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]';
import { memoryBank } from '@warehouse-network/core/src/database-integrity/memory-bank/memory-bank';
import { IntegrityLogCategory, IntegrityLogLevel } from '@warehouse-network/db';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const session = await getServerSession(req, res, authOptions);
  
  if (!session || session.user.role !== 'SUPER_ADMIN') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method === 'GET') {
    try {
      const { category, level, startDate, endDate, search, limit = '100', offset = '0' } = req.query;

      // Search logs
      const logsResult = await memoryBank.searchLogs({
        category: category as IntegrityLogCategory,
        level: level as IntegrityLogLevel,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        searchText: search as string,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string)
      });

      // Get recent alerts
      const alerts = await memoryBank.getAlerts({
        status: 'active',
        limit: 20
      });

      return res.status(200).json({
        logs: logsResult.logs,
        total: logsResult.total,
        hasMore: logsResult.hasMore,
        alerts
      });
    } catch (error) {
      console.error('Failed to fetch logs:', error);
      return res.status(500).json({ error: 'Failed to fetch logs' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}