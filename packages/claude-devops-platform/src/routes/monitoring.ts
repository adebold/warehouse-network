import { Router } from 'express';
import { MonitoringService } from '../services/monitoring';
import { requirePermission } from '../middleware/auth';
import { asyncHandler, BadRequestError } from '../middleware/error-handler';
import { Permission } from '../types';
import { logger } from '../utils/logger';

export const monitoringRouter = Router();

// Get monitoring stack status
monitoringRouter.get('/status',
  requirePermission(Permission.MONITORING_VIEW),
  asyncHandler(async (req, res) => {
    const alerts = await MonitoringService.getInstance().getAlerts({ state: 'firing' });
    
    // This is a simplified status check
    const status = {
      prometheus: true,
      grafana: true,
      alertmanager: true,
      alerts: alerts.slice(0, 10), // Limit to 10 most recent alerts
    };
    
    res.json({
      success: true,
      data: status,
    });
  })
);

// Deploy monitoring stack
monitoringRouter.post('/deploy',
  requirePermission(Permission.MONITORING_CONFIGURE),
  asyncHandler(async (req, res) => {
    await MonitoringService.getInstance().deployMonitoringStack(req.body);
    
    res.status(202).json({
      success: true,
      message: 'Monitoring stack deployment initiated',
    });
  })
);

// Query metrics
monitoringRouter.post('/query',
  requirePermission(Permission.MONITORING_VIEW),
  asyncHandler(async (req, res) => {
    const { query, start, end, step } = req.body;
    
    if (!query) {
      throw new BadRequestError('Query is required');
    }
    
    const result = await MonitoringService.getInstance().queryMetrics({
      query,
      start: start ? new Date(start) : undefined,
      end: end ? new Date(end) : undefined,
      step,
    });
    
    res.json({
      success: true,
      data: result,
    });
  })
);

// Get application metrics
monitoringRouter.get('/metrics/:application',
  requirePermission(Permission.MONITORING_VIEW),
  asyncHandler(async (req, res) => {
    const { application } = req.params;
    const { environment = 'production' } = req.query;
    
    const metrics = await MonitoringService.getInstance().getApplicationMetrics(
      application,
      environment as string
    );
    
    res.json({
      success: true,
      data: metrics,
    });
  })
);

// Get alerts
monitoringRouter.get('/alerts',
  requirePermission(Permission.MONITORING_VIEW),
  asyncHandler(async (req, res) => {
    const { state, ...labels } = req.query;
    
    const alerts = await MonitoringService.getInstance().getAlerts({
      state: state as any,
      labels: labels as any,
    });
    
    res.json({
      success: true,
      data: alerts,
    });
  })
);

// Create alert rule
monitoringRouter.post('/alerts/rules',
  requirePermission(Permission.MONITORING_CONFIGURE),
  asyncHandler(async (req, res) => {
    await MonitoringService.getInstance().createAlertRule(req.body);
    
    res.status(201).json({
      success: true,
      message: 'Alert rule created',
    });
  })
);

// Get dashboards
monitoringRouter.get('/dashboards',
  requirePermission(Permission.MONITORING_VIEW),
  asyncHandler(async (req, res) => {
    const dashboards = await MonitoringService.getInstance().listDashboards();
    
    res.json({
      success: true,
      data: dashboards,
    });
  })
);

// Get dashboard
monitoringRouter.get('/dashboards/:uid',
  requirePermission(Permission.MONITORING_VIEW),
  asyncHandler(async (req, res) => {
    const dashboard = await MonitoringService.getInstance().getDashboard(req.params.uid);
    
    res.json({
      success: true,
      data: dashboard,
    });
  })
);

// Create dashboard
monitoringRouter.post('/dashboards',
  requirePermission(Permission.MONITORING_CONFIGURE),
  asyncHandler(async (req, res) => {
    const uid = await MonitoringService.getInstance().createDashboard(req.body);
    
    res.status(201).json({
      success: true,
      data: { uid },
    });
  })
);

// Calculate SLO
monitoringRouter.post('/slo/calculate',
  requirePermission(Permission.MONITORING_VIEW),
  asyncHandler(async (req, res) => {
    const { objective, startDate, endDate } = req.body;
    
    if (!objective || !startDate || !endDate) {
      throw new BadRequestError('Objective, startDate, and endDate are required');
    }
    
    const result = await MonitoringService.getInstance().calculateSLO(
      objective,
      {
        start: new Date(startDate),
        end: new Date(endDate),
      }
    );
    
    res.json({
      success: true,
      data: result,
    });
  })
);

// Export monitoring configuration
monitoringRouter.get('/export',
  requirePermission(Permission.MONITORING_CONFIGURE),
  asyncHandler(async (req, res) => {
    const config = await MonitoringService.getInstance().exportMonitoringConfig();
    
    res.json({
      success: true,
      data: config,
    });
  })
);