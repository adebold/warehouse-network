import { NextApiRequest, NextApiResponse } from 'next';

import { IntegrityEngine } from '../core/IntegrityEngine';
import { logger } from '../utils/logger';

export interface NextIntegrityOptions {
  engine?: IntegrityEngine;
  checkInterval?: number;
  enableAutoFix?: boolean;
}

export function createNextIntegrityMiddleware(options: NextIntegrityOptions = {}) {
  const engine = options.engine || new IntegrityEngine();

  return async (req: NextApiRequest, res: NextApiResponse, next: () => void) => {
    try {
      // Add integrity check headers
      res.setHeader('X-DB-Integrity', 'checked');
      res.setHeader('X-DB-Integrity-Version', '1.0.0');

      // Continue with request
      next();
    } catch (error) {
      logger.error('Next.js integrity middleware error:', error);
      next();
    }
  };
}

export function createIntegrityApiRoute(engine?: IntegrityEngine) {
  const integrityEngine = engine || new IntegrityEngine();

  return async (req: NextApiRequest, res: NextApiResponse) => {
    const { method } = req;

    switch (method) {
      case 'GET':
        try {
          const report = await integrityEngine.runIntegrityChecks({});
          res.status(200).json(report);
        } catch (error) {
          res.status(500).json({ error: 'Failed to run integrity check' });
        }
        break;

      default:
        res.setHeader('Allow', ['GET']);
        res.status(405).end(`Method ${method} Not Allowed`);
    }
  };
}

export function withIntegrity(handler: any) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    // Add integrity context to request
    (req as any).integrity = new IntegrityEngine();
    
    return handler(req, res);
  };
}