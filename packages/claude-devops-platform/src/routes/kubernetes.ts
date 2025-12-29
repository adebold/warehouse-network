import { Router } from 'express';
import { KubernetesService } from '../services/kubernetes';
import { requirePermission } from '../middleware/auth';
import { asyncHandler, BadRequestError, NotFoundError } from '../middleware/error-handler';
import { Permission } from '../types';
import { logger } from '../utils/logger';

export const kubernetesRouter = Router();

// List namespaces
kubernetesRouter.get('/namespaces',
  requirePermission(Permission.KUBERNETES_VIEW),
  asyncHandler(async (req, res) => {
    const namespaces = await KubernetesService.getInstance().listNamespaces();
    
    res.json({
      success: true,
      data: namespaces,
    });
  })
);

// Create namespace
kubernetesRouter.post('/namespaces',
  requirePermission(Permission.KUBERNETES_CREATE),
  asyncHandler(async (req, res) => {
    const { name, labels } = req.body;
    
    if (!name) {
      throw new BadRequestError('Namespace name is required');
    }
    
    const namespace = await KubernetesService.getInstance().createNamespace(name, labels);
    
    res.status(201).json({
      success: true,
      data: namespace,
    });
  })
);

// List deployments
kubernetesRouter.get('/deployments',
  requirePermission(Permission.KUBERNETES_VIEW),
  asyncHandler(async (req, res) => {
    const { namespace } = req.query;
    const deployments = await KubernetesService.getInstance().listDeployments(namespace as string);
    
    res.json({
      success: true,
      data: deployments,
    });
  })
);

// Get deployment
kubernetesRouter.get('/deployments/:name',
  requirePermission(Permission.KUBERNETES_VIEW),
  asyncHandler(async (req, res) => {
    const { name } = req.params;
    const { namespace = 'default' } = req.query;
    
    const deployment = await KubernetesService.getInstance().getDeployment(name, namespace as string);
    
    res.json({
      success: true,
      data: deployment,
    });
  })
);

// Create deployment
kubernetesRouter.post('/deployments',
  requirePermission(Permission.KUBERNETES_CREATE),
  asyncHandler(async (req, res) => {
    const deployment = await KubernetesService.getInstance().createDeployment(req.body);
    
    res.status(201).json({
      success: true,
      data: deployment,
    });
  })
);

// Update deployment
kubernetesRouter.put('/deployments/:name',
  requirePermission(Permission.KUBERNETES_UPDATE),
  asyncHandler(async (req, res) => {
    const { name } = req.params;
    const { namespace = 'default' } = req.query;
    
    const deployment = await KubernetesService.getInstance().updateDeployment(
      name,
      namespace as string,
      req.body
    );
    
    res.json({
      success: true,
      data: deployment,
    });
  })
);

// Delete deployment
kubernetesRouter.delete('/deployments/:name',
  requirePermission(Permission.KUBERNETES_DELETE),
  asyncHandler(async (req, res) => {
    const { name } = req.params;
    const { namespace = 'default' } = req.query;
    
    await KubernetesService.getInstance().deleteDeployment(name, namespace as string);
    
    res.json({
      success: true,
      message: 'Deployment deleted',
    });
  })
);

// Scale deployment
kubernetesRouter.post('/deployments/:name/scale',
  requirePermission(Permission.KUBERNETES_UPDATE),
  asyncHandler(async (req, res) => {
    const { name } = req.params;
    const { namespace = 'default' } = req.query;
    const { replicas } = req.body;
    
    if (replicas === undefined || replicas < 0) {
      throw new BadRequestError('Valid replica count is required');
    }
    
    const deployment = await KubernetesService.getInstance().scaleDeployment(
      name,
      namespace as string,
      replicas
    );
    
    res.json({
      success: true,
      data: deployment,
    });
  })
);

// List pods
kubernetesRouter.get('/pods',
  requirePermission(Permission.KUBERNETES_VIEW),
  asyncHandler(async (req, res) => {
    const { namespace, labelSelector } = req.query;
    const pods = await KubernetesService.getInstance().getPods(
      namespace as string,
      labelSelector as string
    );
    
    res.json({
      success: true,
      data: pods,
    });
  })
);

// Get pod logs
kubernetesRouter.get('/pods/:name/logs',
  requirePermission(Permission.KUBERNETES_VIEW),
  asyncHandler(async (req, res) => {
    const { name } = req.params;
    const { namespace = 'default', container, tailLines = '100' } = req.query;
    
    const logs = await KubernetesService.getInstance().getPodLogs(
      name,
      namespace as string,
      container as string,
      parseInt(tailLines as string, 10)
    );
    
    res.json({
      success: true,
      data: { logs },
    });
  })
);

// List services
kubernetesRouter.get('/services',
  requirePermission(Permission.KUBERNETES_VIEW),
  asyncHandler(async (req, res) => {
    const { namespace } = req.query;
    
    // This would need to be implemented in KubernetesService
    res.json({
      success: true,
      data: [],
    });
  })
);

// Create service
kubernetesRouter.post('/services',
  requirePermission(Permission.KUBERNETES_CREATE),
  asyncHandler(async (req, res) => {
    const service = await KubernetesService.getInstance().createService(req.body);
    
    res.status(201).json({
      success: true,
      data: service,
    });
  })
);

// Delete service
kubernetesRouter.delete('/services/:name',
  requirePermission(Permission.KUBERNETES_DELETE),
  asyncHandler(async (req, res) => {
    const { name } = req.params;
    const { namespace = 'default' } = req.query;
    
    await KubernetesService.getInstance().deleteService(name, namespace as string);
    
    res.json({
      success: true,
      message: 'Service deleted',
    });
  })
);

// Create ConfigMap
kubernetesRouter.post('/configmaps',
  requirePermission(Permission.KUBERNETES_CREATE),
  asyncHandler(async (req, res) => {
    const { name, namespace = 'default', data } = req.body;
    
    if (!name || !data) {
      throw new BadRequestError('Name and data are required');
    }
    
    const configMap = await KubernetesService.getInstance().createConfigMap(
      name,
      namespace,
      data
    );
    
    res.status(201).json({
      success: true,
      data: configMap,
    });
  })
);

// Create Secret
kubernetesRouter.post('/secrets',
  requirePermission(Permission.KUBERNETES_CREATE),
  asyncHandler(async (req, res) => {
    const { name, namespace = 'default', data, type = 'Opaque' } = req.body;
    
    if (!name || !data) {
      throw new BadRequestError('Name and data are required');
    }
    
    const secret = await KubernetesService.getInstance().createSecret(
      name,
      namespace,
      data,
      type
    );
    
    res.status(201).json({
      success: true,
      data: secret,
    });
  })
);