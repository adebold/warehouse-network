import { Router } from 'express';
import { DeploymentService } from '../services/deployment';
import { requirePermission } from '../middleware/auth';
import { asyncHandler, BadRequestError, NotFoundError } from '../middleware/error-handler';
import { Permission } from '../types';
import { logger } from '../utils/logger';

export const deploymentRouter = Router();

// Create deployment configuration
deploymentRouter.post('/configs', 
  requirePermission(Permission.DEPLOYMENT_CREATE),
  asyncHandler(async (req, res) => {
    const configId = await DeploymentService.getInstance().createDeploymentConfig(req.body);
    
    logger.info('Deployment configuration created', {
      configId,
      name: req.body.name,
      application: req.body.application,
    });
    
    res.status(201).json({
      success: true,
      data: { id: configId },
    });
  })
);

// Create deployment
deploymentRouter.post('/',
  requirePermission(Permission.DEPLOYMENT_CREATE),
  asyncHandler(async (req, res) => {
    const { configId, dryRun } = req.body;
    
    if (!configId) {
      throw new BadRequestError('configId is required');
    }
    
    const deploymentId = await DeploymentService.getInstance().deploy(configId, { dryRun });
    
    res.status(202).json({
      success: true,
      data: { 
        id: deploymentId,
        status: 'pending',
      },
    });
  })
);

// Get deployment
deploymentRouter.get('/:deploymentId',
  requirePermission(Permission.DEPLOYMENT_VIEW),
  asyncHandler(async (req, res) => {
    const deployment = await DeploymentService.getInstance().getDeployment(req.params.deploymentId);
    
    if (!deployment) {
      throw new NotFoundError('Deployment', req.params.deploymentId);
    }
    
    res.json({
      success: true,
      data: deployment,
    });
  })
);

// List deployments
deploymentRouter.get('/',
  requirePermission(Permission.DEPLOYMENT_VIEW),
  asyncHandler(async (req, res) => {
    const filters = {
      application: req.query.application as string,
      environment: req.query.environment as string,
      status: req.query.status as any,
      startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
    };
    
    const deployments = await DeploymentService.getInstance().listDeployments(filters);
    
    res.json({
      success: true,
      data: deployments,
    });
  })
);

// Rollback deployment
deploymentRouter.post('/:deploymentId/rollback',
  requirePermission(Permission.DEPLOYMENT_ROLLBACK),
  asyncHandler(async (req, res) => {
    const rollbackDeploymentId = await DeploymentService.getInstance().rollback(req.params.deploymentId);
    
    logger.info('Deployment rollback initiated', {
      originalDeploymentId: req.params.deploymentId,
      rollbackDeploymentId,
    });
    
    res.json({
      success: true,
      data: { id: rollbackDeploymentId },
    });
  })
);

// Cancel deployment
deploymentRouter.post('/:deploymentId/cancel',
  requirePermission(Permission.DEPLOYMENT_UPDATE),
  asyncHandler(async (req, res) => {
    await DeploymentService.getInstance().cancelDeployment(req.params.deploymentId);
    
    res.json({
      success: true,
      message: 'Deployment cancelled',
    });
  })
);

// Get deployment history
deploymentRouter.get('/history/:application',
  requirePermission(Permission.DEPLOYMENT_VIEW),
  asyncHandler(async (req, res) => {
    const { application } = req.params;
    const { environment = 'production', limit = '10' } = req.query;
    
    const history = await DeploymentService.getInstance().getDeploymentHistory(
      application,
      environment as string,
      parseInt(limit as string, 10)
    );
    
    res.json({
      success: true,
      data: history,
    });
  })
);