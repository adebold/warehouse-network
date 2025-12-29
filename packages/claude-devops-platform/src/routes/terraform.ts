import { Router } from 'express';
import { TerraformService } from '../services/terraform';
import { requirePermission } from '../middleware/auth';
import { asyncHandler, BadRequestError, NotFoundError } from '../middleware/error-handler';
import { Permission } from '../types';
import { logger } from '../utils/logger';
import { AuthRequest } from '../middleware/auth';

export const terraformRouter = Router();

// Create workspace
terraformRouter.post('/workspaces',
  requirePermission(Permission.TERRAFORM_PLAN),
  asyncHandler(async (req: AuthRequest, res) => {
    const { name, ...config } = req.body;
    
    if (!name) {
      throw new BadRequestError('Workspace name is required');
    }
    
    await TerraformService.getInstance().createWorkspace(name, config);
    
    logger.info('Terraform workspace created', {
      workspace: name,
      userId: req.user?.id,
    });
    
    res.status(201).json({
      success: true,
      data: { name },
    });
  })
);

// List workspaces
terraformRouter.get('/workspaces',
  requirePermission(Permission.TERRAFORM_PLAN),
  asyncHandler(async (req, res) => {
    const workspaces = await TerraformService.getInstance().listWorkspaces();
    
    res.json({
      success: true,
      data: workspaces,
    });
  })
);

// Select workspace
terraformRouter.post('/workspaces/:name/select',
  requirePermission(Permission.TERRAFORM_PLAN),
  asyncHandler(async (req, res) => {
    await TerraformService.getInstance().selectWorkspace(req.params.name);
    
    res.json({
      success: true,
      message: `Workspace ${req.params.name} selected`,
    });
  })
);

// Delete workspace
terraformRouter.delete('/workspaces/:name',
  requirePermission(Permission.TERRAFORM_DESTROY),
  asyncHandler(async (req: AuthRequest, res) => {
    await TerraformService.getInstance().deleteWorkspace(req.params.name);
    
    logger.info('Terraform workspace deleted', {
      workspace: req.params.name,
      userId: req.user?.id,
    });
    
    res.json({
      success: true,
      message: 'Workspace deleted',
    });
  })
);

// Initialize terraform
terraformRouter.post('/init',
  requirePermission(Permission.TERRAFORM_PLAN),
  asyncHandler(async (req, res) => {
    await TerraformService.getInstance().init(req.body);
    
    res.json({
      success: true,
      message: 'Terraform initialized',
    });
  })
);

// Create plan
terraformRouter.post('/plan',
  requirePermission(Permission.TERRAFORM_PLAN),
  asyncHandler(async (req: AuthRequest, res) => {
    const plan = await TerraformService.getInstance().plan(req.body);
    
    logger.info('Terraform plan created', {
      planId: plan.id,
      hasChanges: plan.hasChanges,
      resourceChanges: plan.resourceChanges.length,
      userId: req.user?.id,
    });
    
    res.json({
      success: true,
      data: plan,
    });
  })
);

// Apply plan
terraformRouter.post('/apply',
  requirePermission(Permission.TERRAFORM_APPLY),
  asyncHandler(async (req: AuthRequest, res) => {
    const { planId, ...config } = req.body;
    
    if (!planId && !config.autoApprove) {
      throw new BadRequestError('Plan ID is required when auto-approve is not enabled');
    }
    
    await TerraformService.getInstance().apply(config, planId);
    
    logger.info('Terraform plan applied', {
      planId,
      userId: req.user?.id,
    });
    
    res.status(202).json({
      success: true,
      message: 'Terraform apply initiated',
    });
  })
);

// Destroy resources
terraformRouter.post('/destroy',
  requirePermission(Permission.TERRAFORM_DESTROY),
  asyncHandler(async (req: AuthRequest, res) => {
    if (!req.body.autoApprove) {
      throw new BadRequestError('Auto-approve must be explicitly set for destroy operations');
    }
    
    await TerraformService.getInstance().destroy(req.body);
    
    logger.warn('Terraform destroy initiated', {
      workspace: req.body.workspace,
      userId: req.user?.id,
    });
    
    res.status(202).json({
      success: true,
      message: 'Terraform destroy initiated',
    });
  })
);

// Validate configuration
terraformRouter.post('/validate',
  requirePermission(Permission.TERRAFORM_PLAN),
  asyncHandler(async (req, res) => {
    const result = await TerraformService.getInstance().validate(req.body);
    
    res.json({
      success: true,
      data: result,
    });
  })
);

// Format configuration
terraformRouter.post('/format',
  requirePermission(Permission.TERRAFORM_PLAN),
  asyncHandler(async (req, res) => {
    const formattedFiles = await TerraformService.getInstance().format(req.body);
    
    res.json({
      success: true,
      data: { formattedFiles },
    });
  })
);

// Get state
terraformRouter.get('/state',
  requirePermission(Permission.TERRAFORM_PLAN),
  asyncHandler(async (req, res) => {
    const config = req.query as any;
    const state = await TerraformService.getInstance().getState(config);
    
    res.json({
      success: true,
      data: state,
    });
  })
);

// Get outputs
terraformRouter.get('/outputs',
  requirePermission(Permission.TERRAFORM_PLAN),
  asyncHandler(async (req, res) => {
    const config = req.query as any;
    const outputs = await TerraformService.getInstance().getOutputs(config);
    
    res.json({
      success: true,
      data: outputs,
    });
  })
);

// Import resource
terraformRouter.post('/import',
  requirePermission(Permission.TERRAFORM_APPLY),
  asyncHandler(async (req: AuthRequest, res) => {
    const { resourceAddress, resourceId, ...config } = req.body;
    
    if (!resourceAddress || !resourceId) {
      throw new BadRequestError('Resource address and ID are required');
    }
    
    await TerraformService.getInstance().importResource(config, resourceAddress, resourceId);
    
    logger.info('Terraform resource imported', {
      resourceAddress,
      resourceId,
      userId: req.user?.id,
    });
    
    res.json({
      success: true,
      message: 'Resource imported successfully',
    });
  })
);

// Move resource
terraformRouter.post('/state/move',
  requirePermission(Permission.TERRAFORM_APPLY),
  asyncHandler(async (req: AuthRequest, res) => {
    const { source, destination, ...config } = req.body;
    
    if (!source || !destination) {
      throw new BadRequestError('Source and destination are required');
    }
    
    await TerraformService.getInstance().moveResource(config, source, destination);
    
    logger.info('Terraform resource moved', {
      source,
      destination,
      userId: req.user?.id,
    });
    
    res.json({
      success: true,
      message: 'Resource moved successfully',
    });
  })
);

// Remove resource from state
terraformRouter.delete('/state/resource',
  requirePermission(Permission.TERRAFORM_DESTROY),
  asyncHandler(async (req: AuthRequest, res) => {
    const { resourceAddress, ...config } = req.body;
    
    if (!resourceAddress) {
      throw new BadRequestError('Resource address is required');
    }
    
    await TerraformService.getInstance().removeResource(config, resourceAddress);
    
    logger.warn('Terraform resource removed from state', {
      resourceAddress,
      userId: req.user?.id,
    });
    
    res.json({
      success: true,
      message: 'Resource removed from state',
    });
  })
);

// Add module
terraformRouter.post('/modules',
  requirePermission(Permission.TERRAFORM_PLAN),
  asyncHandler(async (req, res) => {
    const { module, ...config } = req.body;
    
    if (!module || !module.name || !module.source) {
      throw new BadRequestError('Module name and source are required');
    }
    
    await TerraformService.getInstance().addModule(config, module);
    
    res.json({
      success: true,
      message: 'Module added successfully',
    });
  })
);

// Upgrade modules
terraformRouter.post('/modules/upgrade',
  requirePermission(Permission.TERRAFORM_APPLY),
  asyncHandler(async (req, res) => {
    await TerraformService.getInstance().upgradeModules(req.body);
    
    res.json({
      success: true,
      message: 'Modules upgraded successfully',
    });
  })
);

// Estimate cost
terraformRouter.get('/cost/estimate/:planId',
  requirePermission(Permission.TERRAFORM_PLAN),
  asyncHandler(async (req, res) => {
    const estimate = await TerraformService.getInstance().estimateCost(req.params.planId);
    
    res.json({
      success: true,
      data: estimate,
    });
  })
);

// Run security scan
terraformRouter.post('/security/scan',
  requirePermission(Permission.TERRAFORM_PLAN),
  asyncHandler(async (req, res) => {
    const scanResult = await TerraformService.getInstance().runSecurityScan(req.body);
    
    res.json({
      success: true,
      data: scanResult,
    });
  })
);

// Get Terraform version
terraformRouter.get('/version',
  asyncHandler(async (req, res) => {
    const version = await TerraformService.getInstance().getVersion();
    
    res.json({
      success: true,
      data: { version },
    });
  })
);

// Check version compatibility
terraformRouter.post('/version/check',
  asyncHandler(async (req, res) => {
    const { requiredVersion } = req.body;
    
    if (!requiredVersion) {
      throw new BadRequestError('Required version is required');
    }
    
    const isCompatible = await TerraformService.getInstance().checkVersion(requiredVersion);
    
    res.json({
      success: true,
      data: { isCompatible },
    });
  })
);