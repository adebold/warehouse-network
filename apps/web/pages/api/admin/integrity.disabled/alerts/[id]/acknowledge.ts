import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../../auth/[...nextauth]';
import { memoryBank } from '@warehouse-network/core/src/database-integrity/memory-bank/memory-bank';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const session = await getServerSession(req, res, authOptions);
  
  if (!session || session.user.role !== 'SUPER_ADMIN') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method === 'POST') {
    try {
      const { id } = req.query;
      
      if (!id || typeof id !== 'string') {
        return res.status(400).json({ error: 'Invalid alert ID' });
      }

      const alert = await memoryBank.acknowledgeAlert(id, session.user.id);

      return res.status(200).json({ alert });
    } catch (error) {
      console.error('Failed to acknowledge alert:', error);
      return res.status(500).json({ error: 'Failed to acknowledge alert' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}