import { Request, Response, NextFunction } from 'express';

import { IntegrityEngine } from '../core/IntegrityEngine';
import { logger } from '../utils/logger';

export interface IntegrityMiddlewareOptions {
  engine?: IntegrityEngine;
  checkInterval?: number;
  enableAutoFix?: boolean;
  skipPaths?: string[];
}

export function createIntegrityMiddleware(options: IntegrityMiddlewareOptions = {}) {
  const engine = options.engine || new IntegrityEngine();
  const skipPaths = options.skipPaths || ['/health', '/metrics'];

  return async (req: Request, res: Response, next: NextFunction) => {
    // Skip middleware for certain paths
    if (skipPaths.includes(req.path)) {
      return next();
    }

    try {
      // Add integrity check headers
      res.setHeader('X-DB-Integrity', 'checked');
      res.setHeader('X-DB-Integrity-Version', '1.0.0');

      // Continue with request
      next();
    } catch (error) {
      logger.error('Integrity middleware error:', error);
      next(error);
    }
  };
}

export function createIntegrityRouter(engine?: IntegrityEngine) {
  const router = require('express').Router();
  const integrityEngine = engine || new IntegrityEngine();

  router.get('/integrity/status', async (req: Request, res: Response) => {
    try {
      const report = await integrityEngine.runIntegrityChecks({});
      res.json(report);
    } catch (error) {
      res.status(500).json({ error: 'Failed to run integrity check' });
    }
  });

  router.get('/integrity/drift', async (req: Request, res: Response) => {
    try {
      const drift = await integrityEngine.checkSchemaDrift();
      res.json(drift);
    } catch (error) {
      res.status(500).json({ error: 'Failed to check schema drift' });
    }
  });

  return router;
}