import { Router } from 'express';
import { PipelineService } from '../services/pipeline';
import { requirePermission } from '../middleware/auth';
import { asyncHandler, BadRequestError, NotFoundError } from '../middleware/error-handler';
import { Permission } from '../types';
import { logger } from '../utils/logger';
import { AuthRequest } from '../middleware/auth';

export const pipelineRouter = Router();

// Create pipeline
pipelineRouter.post('/',
  requirePermission(Permission.PIPELINE_CREATE),
  asyncHandler(async (req: AuthRequest, res) => {
    const pipelineId = await PipelineService.getInstance().createPipeline(req.body);
    
    logger.info('Pipeline created', {
      pipelineId,
      name: req.body.name,
      userId: req.user?.id,
    });
    
    res.status(201).json({
      success: true,
      data: { id: pipelineId },
    });
  })
);

// Update pipeline
pipelineRouter.put('/:pipelineId',
  requirePermission(Permission.PIPELINE_UPDATE),
  asyncHandler(async (req, res) => {
    await PipelineService.getInstance().updatePipeline(req.params.pipelineId, req.body);
    
    res.json({
      success: true,
      message: 'Pipeline updated',
    });
  })
);

// Delete pipeline
pipelineRouter.delete('/:pipelineId',
  requirePermission(Permission.PIPELINE_DELETE),
  asyncHandler(async (req: AuthRequest, res) => {
    await PipelineService.getInstance().deletePipeline(req.params.pipelineId);
    
    logger.info('Pipeline deleted', {
      pipelineId: req.params.pipelineId,
      userId: req.user?.id,
    });
    
    res.json({
      success: true,
      message: 'Pipeline deleted',
    });
  })
);

// Get pipeline
pipelineRouter.get('/:pipelineId',
  requirePermission(Permission.PIPELINE_VIEW),
  asyncHandler(async (req, res) => {
    const pipeline = await PipelineService.getInstance().getPipeline(req.params.pipelineId);
    
    res.json({
      success: true,
      data: pipeline,
    });
  })
);

// List pipelines
pipelineRouter.get('/',
  requirePermission(Permission.PIPELINE_VIEW),
  asyncHandler(async (req, res) => {
    const pipelines = await PipelineService.getInstance().listPipelines();
    
    res.json({
      success: true,
      data: pipelines,
    });
  })
);

// Execute pipeline
pipelineRouter.post('/:pipelineId/execute',
  requirePermission(Permission.PIPELINE_EXECUTE),
  asyncHandler(async (req: AuthRequest, res) => {
    const { environment } = req.body;
    const triggeredBy = req.user?.email || req.apiKey?.name || 'system';
    
    const executionId = await PipelineService.getInstance().executePipeline(
      req.params.pipelineId,
      triggeredBy,
      environment
    );
    
    logger.info('Pipeline execution started', {
      pipelineId: req.params.pipelineId,
      executionId,
      triggeredBy,
    });
    
    res.status(202).json({
      success: true,
      data: { id: executionId },
    });
  })
);

// Get execution
pipelineRouter.get('/executions/:executionId',
  requirePermission(Permission.PIPELINE_VIEW),
  asyncHandler(async (req, res) => {
    const execution = await PipelineService.getInstance().getExecution(req.params.executionId);
    
    if (!execution) {
      throw new NotFoundError('Pipeline execution', req.params.executionId);
    }
    
    res.json({
      success: true,
      data: execution,
    });
  })
);

// List executions
pipelineRouter.get('/:pipelineId/executions',
  requirePermission(Permission.PIPELINE_VIEW),
  asyncHandler(async (req, res) => {
    const executions = await PipelineService.getInstance().listExecutions(req.params.pipelineId);
    
    res.json({
      success: true,
      data: executions,
    });
  })
);

// Cancel execution
pipelineRouter.post('/executions/:executionId/cancel',
  requirePermission(Permission.PIPELINE_EXECUTE),
  asyncHandler(async (req: AuthRequest, res) => {
    await PipelineService.getInstance().cancelExecution(req.params.executionId);
    
    logger.info('Pipeline execution cancelled', {
      executionId: req.params.executionId,
      userId: req.user?.id,
    });
    
    res.json({
      success: true,
      message: 'Pipeline execution cancelled',
    });
  })
);

// Webhook trigger
pipelineRouter.post('/webhook/:pipelineId',
  asyncHandler(async (req, res) => {
    const { pipelineId } = req.params;
    const signature = req.headers['x-webhook-signature'] as string;
    
    // Validate webhook signature
    // This would need to be implemented based on your webhook configuration
    
    const executionId = await PipelineService.getInstance().executePipeline(
      pipelineId,
      'webhook',
      { webhook: req.body }
    );
    
    logger.info('Pipeline triggered by webhook', {
      pipelineId,
      executionId,
    });
    
    res.json({
      success: true,
      data: { id: executionId },
    });
  })
);