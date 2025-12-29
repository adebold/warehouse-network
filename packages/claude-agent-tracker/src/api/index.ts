/**
 * API Routes
 */

import { Router } from 'express';

import { agentRoutes } from './agents.js';
import { authRoutes } from './auth.js';
import { changeRoutes } from './changes.js';
import { metricsRoutes } from './metrics.js';
import { taskRoutes } from './tasks.js';

export const apiRouter = Router();

// API version
apiRouter.get('/version', (req, res) => {
  res.json({
    version: '1.0.0',
    api: 'v1'
  });
});

// Mount route modules
apiRouter.use('/auth', authRoutes);
apiRouter.use('/agents', agentRoutes);
apiRouter.use('/tasks', taskRoutes);
apiRouter.use('/changes', changeRoutes);
apiRouter.use('/metrics', metricsRoutes);