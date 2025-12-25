import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]';
import { memoryBank } from '@warehouse-network/core/src/database-integrity/memory-bank/memory-bank';
import { IntegrityLogCategory } from '@warehouse-network/db';

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
      const { format = 'json', category, startDate, endDate } = req.query;

      const exportData = await memoryBank.exportLogs({
        format: format as 'json' | 'csv',
        category: category as IntegrityLogCategory,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined
      });

      // Set appropriate headers
      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=integrity-logs.csv');
      } else {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename=integrity-logs.json');
      }

      return res.status(200).send(exportData);
    } catch (error) {
      console.error('Failed to export logs:', error);
      return res.status(500).json({ error: 'Failed to export logs' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}