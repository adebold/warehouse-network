import { IntegrityEngine } from 'claude-db-integrity';
import type { NextApiRequest, NextApiResponse } from 'next';
import { logger } from '../../../../../../../../../utils/logger';

type Data = {
  success: boolean;
  report?: any;
  error?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ 
      success: false, 
      error: 'Method not allowed' 
    });
  }

  try {
    // Initialize integrity engine
    const engine = new IntegrityEngine();
    await engine.initialize();

    // Parse options from query parameters
    const options = {
      fix: req.query.fix === 'true',
      verbose: req.query.verbose === 'true'
    };

    // Run integrity checks
    const report = await engine.runIntegrityChecks(options);

    // Return report
    res.status(200).json({
      success: true,
      report: {
        id: report.id,
        timestamp: report.timestamp,
        summary: report.summary,
        checks: report.checks.filter(check => 
          check.status === 'failed' || req.query.verbose === 'true'
        ),
        metadata: report.metadata
      }
    });

    await engine.shutdown();
  } catch (error) {
    logger.error('Integrity check API error:', error);
    
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
};